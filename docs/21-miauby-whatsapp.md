# 21 - Miauby WhatsApp

## O que esta parte documenta

Este documento registra a primeira estrutura do canal WhatsApp do Miauby. A implementacao inicial cria um backend dedicado em Node.js/TypeScript, com Postgres 17 proprio, webhook para Evolution API ou Meta Cloud API, fila duravel, deduplicacao, allowlist, painel operacional e outbox. O repositorio nasce desligado por padrao; em producao, o canal pode ser ligado por `.env` quando token, cifragem e allowlist estiverem revisados.

Desde 2026-05-27, o bridge tambem pode receber audio de WhatsApp, transcrever com Gemini e, quando habilitado, responder com audio gerado por Gemini TTS. Audio bruto nao e salvo no banco: o evento guarda apenas metadados sanitizados e a transcricao textual usada pelo roteador. Desde 2026-06-03, essa entrada segue a mesma protecao do audio interno: o prompt nao usa lista de termos internos, transcricao parecida com glossario/seed ou longa demais para audio curto e bloqueada, nao chega ao roteador/comandos e recebe resposta curta pedindo texto ou audio claro.

Desde 2026-05-27, o bridge tambem pode ler foto, print, imagem encaminhada ou PDF/documento de comprovante Pix de remetente autorizado, validar o destino por CNPJ/chave Pix ou nome correlato configurado e preparar um lancamento `Pix CNPJ` no Financeiro com confirmacao `Sim`/`Nao`. A midia e baixada apenas em memoria no worker, enviada ao Gemini para extracao estruturada e descartada; o banco guarda somente metadados sanitizados e o comando/pendencia gerados. Desde 2026-06-01, a validacao ficou mais conservadora: CNPJ de destino diferente do configurado bloqueia o lancamento, CNPJ achado apenas no texto bruto so vale quando aparece em contexto de destino/recebedor, a extracao pode carregar ID Pix/E2E e confianca por campo, e falhas/recusas registram diagnostico sanitizado sem `raw_text` completo. Ainda em 2026-06-01, a etapa de velocidade corta chamadas desnecessarias: antes do OCR, descarta anexos com legenda/nome/extensao claramente nao Pix; quando o transporte fornece hash do arquivo, usa hash salgado para reconhecer repeticao; e depois da extracao usa ID Pix/E2E para evitar nova confirmacao de comprovante ja tratado nos ultimos 90 dias. Quando a imagem nao parece comprovante Pix, o Miauby responde `Isso ai é um comprovante pix?` sem criar pendencia. Se a leitura falhar, ficar incompleta ou destino ficar duvidoso, o WhatsApp responde curto: `Nao consegui ler bem o comprovante 😿 Me mande assim: miauby pix cnpj 28,90 sueli.`.

Desde 2026-06-02, o comprovante Pix por midia separa detalhe interno de resposta publica: OCR, destino, pagador completo, instituicao, ID Pix, confiancas e observacao completa continuam no payload sanitizado, na pendencia e no Financeiro, mas o WhatsApp mostra apenas resumo operacional curto, como `PIX CNPJ lançado: R$ 28,90 — Responsável: Sueli — 01/06 às 12:16.`. Se faltar responsavel, a resposta deve ser `Comprovante lido. Valor: R$ 28,90 — Responsável não identificado. Confira no Financeiro.`. Desde 2026-06-03, quando a midia vem do perfil institucional `Farmacia` e a leitura passa, o bridge nao abre confirmacao `Sim/Nao` nem usa o pagador como humano: responde `PIX CNPJ encontrado: R$ 28,90 - 02/06/2026.`, pergunta `Quem foi o responsavel?`, lista usuarios ativos e so grava apos a escolha.

Desde 2026-05-29, o painel operacional reorganiza `n8n automacoes` e `Sincronia recente` em grids responsivos com quebra segura de texto, para que numeros, eventos, motores e mensagens longas fiquem legiveis sem estourar os cards. A area de `n8n automacoes` tambem mostra, por rotina, o que o n8n agenda/chama, o que o Miauby faz, exemplo do estilo da mensagem, destino calculado pelos cards liberados e o controle de ligar/desligar quando a rotina ja e executada pelo backend.

Desde 2026-06-02, o painel `/miauw/whatsapp/` passou a abrir em leitura simplificada: uma faixa `Estado agora` resume canal, fila, integracao, resposta e erros, enquanto indicadores completos, allowlist, configuracao, estados, n8n, eventos e outbox ficam recolhidos em secoes expansivas. `Sincronia recente` continua visivel para operacao diaria, e `Erros abertos` abre automaticamente apenas quando houver falha acionavel. A mudanca e apenas de apresentacao; webhook, fila, envio, allowlist, tokens e regras de negocio nao foram alterados.

Desde 2026-05-29, contatos da allowlist podem ser vinculados a usuarios do core pelo painel `/usuarios/`. O bridge continua sendo o dono do telefone completo cifrado/hash; o core recebe apenas `contact_id`, mascara, nome, status e cards liberados para permitir aviso individual por funcionario.

Desde 2026-06-03, contatos vinculados a `core_users.role='farmacia'` representam o WhatsApp oficial/institucional da loja. Esse perfil continua autorizado por allowlist/cards, mas nao e tratado como responsavel humano de sangria, Pix CNPJ, pedido ou outro lancamento operacional. Quando o comando ja informa um nome valido, o bridge resolve esse nome contra usuarios ativos que nao sejam `farmacia`; quando nao informa ou informa nome inexistente, grava uma pendencia `tool=selecionar_responsavel_whatsapp`, lista usuarios ativos e aceita resposta por numero, ordinal ou nome antes de executar. Para comprovante Pix CNPJ por foto/PDF lido com sucesso, o mesmo perfil recebe primeiro o resumo do valor/data/destino e escolhe o responsavel humano; se a midia nao for lida com confianca, recebe apenas o atalho manual `miauby pix cnpj 28,90 sueli`. Essa escolha de responsavel e separada de confirmacoes `Sim/Nao` de acao forte: para cancelamento de pedido ou concluir/cancelar tarefa, primeiro escolhe o humano e depois entra na escolha/confirmacao da acao. Em Tarefas, `miauby tarefa para thiago conferir pedido` cria tarefa privada para Thiago; `miauby tarefa conferir pedido` pergunta `Essa tarefa e para quem?` e lista usuarios mais `Geral/equipe`, usando `tool=selecionar_destino_tarefa_whatsapp`. A opcao `Geral/equipe` cria tarefa geral somente pelo endpoint interno tokenizado com `source=miauby_whatsapp`, sem transformar o perfil `farmacia` em admin na tela do modulo.

Desde 2026-06-02, o bridge respeita `Ferias do usuario`, cadastrado no modulo Usuarios. Antes de qualquer envio automatico por card, lembrete de Tarefa, encomenda da Cotacao, rotina n8n ou alerta operacional, o bridge consulta `core_user_vacations` pelo `linked_user_id` do contato. Se o usuario estiver em ferias no fuso `America/Sao_Paulo`, a mensagem nao e enviada, o contato continua na allowlist, o login continua liberado e o bloqueio fica registrado em `core_user_vacation_message_logs` e `core_audit_logs`. O primeiro dia de ferias e o dia do retorno tambem podem gerar uma saudacao curta automatica para o proprio usuario, com marcas de idempotencia no core.

Desde 2026-06-03, o bridge cria Pedidos pelo WhatsApp sem passar pelo Gemini quando a mensagem autorizada vem no padrao `miauby pedido ...` ou em variacoes operacionais como `miauby distribuidora anb 350`. O parser aceita fornecedor antes/depois do valor, `R$`, `valor/deu/ficou/total/boleto`, abreviacoes comuns (`venc`, `pgto`, `prev`), previsao de chegada (`amanha`, `05/06`, `segunda`, `semana que vem`), status inicial (`ja chegou so pagar`, `pago falta chegar`, `pago e recebido`) e parcelas com vencimento (`2 parcelas 200 10/06 e 150 20/06`, `1x/2x`, `dia 10`). Em parcelamento com um unico valor, `350 em 2x` trata 350 como total dividido, enquanto `2 parcelas 175` ou `2 boletos 175` trata 175 como valor de cada parcela. O contato precisa estar na allowlist, ter card `Pedidos` e estar vinculado a um usuario do core; o app Pedidos revalida `actor_user_id` e respeita `core_user_module_permissions`. A mesma mensagem usa `idempotency_key=whatsapp:{trace_id}` em `POST /pedidos/api/internal/create-order`, evitando duplicar conta financeira/pagamento em retry de webhook ou worker. Se faltar fornecedor/valor, houver data passada, permissao faltando ou status contraditorio, o bridge responde curto e nao grava nada; quando a soma das parcelas divergir do total informado, ele cria uma pendencia `Sim/Nao` vinculada ao ultimo comando daquele numero e so grava se a pessoa confirmar. A resposta publica do WhatsApp tambem e curta e operacional, por exemplo `Pedido criado: ANB - R$ 350,00.` ou `Pedido parcelado criado: ANB - 2 parcelas - R$ 350,00.`, sem despejar detalhes tecnicos.

Ainda em 2026-06-03, Pedidos ganhou comandos de consulta e cancelamento compartilhados entre WhatsApp e Miauby interno. No WhatsApp autorizado, `miauby pedido`, `miauby pedidos`, `miauby ver pedidos`, `miauby pedidos abertos`, `miauby o que tem para chegar`, `miauby o que falta chegar` e `miauby pedidos aguardando chegada` listam somente pedidos em `Aguardando chegada`, um por linha, com fornecedor, valor, data do pedido, previsao ou `sem previsao` e status `aguardando chegada`/`ja pago, falta chegar`. Se nao houver nada, responde `Nenhum pedido aguardando chegada. Milagre logistico detectado 😼`. Para cancelar, aceita `miauby cancelar pedido anb`, `miauby cancelar pedido da nissei`, `miauby cancelar pedido 350`, `miauby remover pedido anb`, `miauby excluir pedido da santa cruz` e `miauby nao precisa mais do pedido da anb`. O bridge chama `GET /pedidos/api/internal/cancel-candidates` com `actor_user_id`; o app Pedidos revalida permissao do usuario no core e busca somente pedidos ainda aguardando chegada. Com um candidato claro, o bridge pede `Confirma cancelar: ANB - R$ 350,00?`. Se houver pagamento ou conta financeira vinculada, a pergunta vira `Esse pedido tem financeiro vinculado. Confirma cancelar mesmo assim: ANB - R$ 350,00?`. Com varios candidatos, ele lista opcoes numeradas e guarda pendencia em `miauw_whatsapp_confirmations` com `tool=selecionar_pedido_whatsapp`; respostas como `1`, `a segunda`, `a de 350`, `anb 350` ou `cancela a primeira` escolhem o pedido, e depois ainda vem a confirmacao final. A execucao chama `POST /pedidos/api/internal/cancel-order` com `idempotency_key=whatsapp-confirm:{confirmation_id}`, `source=miauby_whatsapp` e auditoria; o app Pedidos arquiva/cancela logicamente sem apagar pagamentos, parcelas ou historico financeiro. Pedido ja finalizado/historico nao entra nesse comando.

Desde 2026-06-03, o bridge tambem entende sangria do Financeiro localmente antes de chamar Gemini/PHP. Exemplos aceitos: `miauby sangria 10`, `miauby sangria R$ 10,00`, `miauby sangria de 35,90`, `miauby faz sangria de 10`, `miauby tira 10 do caixa como sangria`, `miauby retirei 15 do caixa`, `miauby sangria 50 sueli compra de cafe` e `miauby sangria 25 para mercado`. O contato precisa estar na allowlist, ter card `Financeiro` e estar vinculado a `core_users`; para funcionario comum, o responsavel oficial e o usuario vinculado ao numero, para evitar registrar como outra pessoa por texto digitado. Se o contato for perfil `farmacia`, o nome depois do valor pode definir o responsavel humano; sem nome, o Miauby pergunta `Quem fez essa sangria?`, lista usuarios e espera numero/nome antes de gravar. O valor e normalizado em centavos, `0`/negativo nao grava, texto sem valor pede `miauby sangria 10 troco`, valor confuso responde curto sem gravar, e valores altos como `R$ 10.000,00` viram pendencia `Sim/Nao` depois da escolha do responsavel. A gravacao chama `POST /financeiro/api/internal/lancamentos` com `categoria=Sangria`, `source=miauby_whatsapp`, `actor_user_id`, observacao curta e `idempotency_key=whatsapp:sangria:{trace_id}` ou `whatsapp-confirm:{confirmation_id}`; o Financeiro revalida permissao do usuario e recalcula o caixa. A resposta publica fica curta: `Sangria registrada: R$ 10,00 - Will.` ou `Sangria registrada: R$ 25,00 - Will - mercado.`, e duplicidade retorna `Sangria ja registrada. Nao dupliquei 😼`.

Desde 2026-06-03, o bridge tambem registra `Pix CNPJ` por texto manual quando o comprovante por foto/PDF nao for lido com seguranca. Exemplos aceitos: `miauby pix cnpj 28,90 sueli`, `miauby pix cnpj valor 28,90 responsavel sueli`, `miauby pix cnpj quem fez sueli valor 28,90`, `miauby lancar pix cnpj 28,90 sueli`, `miauby pix cnpj sueli 28,90`, `miauby pix cnpj 28.90 sueli`, `miauby pix cnpj 28 reais sueli`, `miauby pix cnpj 28,90 sueli fornecedor nissei` e `miauby pix cpnj 28,90 sueli obs comprovante nao leu`. O contato precisa estar na allowlist e ter card `Financeiro`; para funcionario comum, o usuario vinculado ao numero e o responsavel oficial e o nome digitado diferente fica apenas em auditoria/observacao. Se o contato for perfil `farmacia`, o nome informado resolve o responsavel humano; se faltar nome, o Miauby mostra `PIX CNPJ informado: R$ 28,90.`, pergunta `Quem foi o responsavel?`, lista usuarios e espera numero/nome antes de gravar. Se nao houver vinculo nem responsavel resolvido, nao grava. Falta de valor ou responsavel nao grava. A gravacao usa `POST /financeiro/api/internal/lancamentos`, `categoria=Pix CNPJ`, `source=miauby_whatsapp`, `actor_user_id`, texto original em log/observacao e `idempotency_key=whatsapp:pix-cnpj:{trace_id}` para nao duplicar retry do mesmo evento. A resposta publica fica curta: `PIX CNPJ lancado: R$ 28,90 - Sueli.` ou `PIX CNPJ lancado: R$ 28,90 - Sueli - compra mercado.`; duplicidade retorna `PIX CNPJ ja registrado. Nao dupliquei 😼`.

Em 2026-06-03, o treinamento deterministico de sangria ganhou mais tolerancia para escrita natural, erros simples e observacao/motivo. Depois de identificar o valor e, quando houver, um nome conhecido citado no texto, o restante vira observacao: `miauby sangria 10 troco`, `miauby sangria 50 compra de agua`, `miauby sangria 20 obs cafe`, `miauby sangria 30 motivo mercado`, `miauby sangria de 25 da sueli para despesa pequena`, `miauby will tirou 10 do caixa para troco`, `miauby baixa 45 do caixa como sangria para mercado`. Valores pequenos por extenso e unidades coloquiais como `dez`, `vinte`, `10 conto`, `20 pila` tambem podem ser normalizados quando o contexto indicar sangria. Se uma palavra depois do valor nao for usuario conhecido, ela e tratada como observacao, nao como responsavel; se for usuario conhecido diferente do dono do numero, fica somente na auditoria. O numero vinculado continua vencendo como responsavel oficial. Quando faltar valor, a resposta operacional e `Faltou o valor. Me mande assim: miauby sangria 10 troco.`.

Tambem em 2026-06-03, ficou registrada a regra padrao de treinamento compartilhado: todo comando textual criado ou melhorado no Miauby WhatsApp deve ser registrado como variacao textual para o Miauby interno quando fizer sentido. O WhatsApp continua exigindo `miauby` conforme prefixo/allowlist, mas o interno deve aceitar a forma direta sem prefixo. Exemplo: WhatsApp `miauby pix cnpj 28,90 sueli`; interno `pix cnpj 28,90 compra fornecedor`, `lancar pix cnpj 28,90 compra fornecedor` ou `registrar pix cnpj valor 28,90 observacao compra urgente`. A diferenca de identidade e obrigatoria: no interno, o responsavel vem da sessao do usuario logado; no WhatsApp, vem do numero vinculado/allowlist. Usuario comum nao pode registrar acao em nome de outro sem permissao validada. Se o comando depender de foto, PDF, audio ou comprovante, o interno aprende apenas a versao textual/manual; nao ha OCR, leitura de midia nem audio operacional no chat interno. A regra fica em `site/miauw/miauw-funcoes.php` (`identity_context`, `text_command_contracts`/`text_command_training`) e em `apps/miauby/src/text-command-contracts.ts`, e nao habilita escrita direta no Node.

Tambem em 2026-06-03, Tarefas ganhou interpretacao textual compartilhada. No WhatsApp autorizado, com card `Tarefas` e usuario vinculado, o bridge entende `miauby tarefas`, `miauby minhas tarefas`, `miauby o que preciso fazer`, `miauby tarefa conferir caixa`, `miauby tarefa para sueli conferir caixa`, `miauby tarefa geral limpar balcao`, `miauby consultar tarefa conferir pedido`, `miauby conclui tarefa conferir caixa` e `miauby cancelar tarefa conferir caixa`. Usuario comum cria tarefa privada para si por padrao; ADM/admin pode criar para outro usuario ou tarefa geral. O perfil `farmacia` e excecao institucional: quando cria tarefa sem destino, pergunta quem vai receber; quando escolhe usuario, cria privada para esse usuario; quando escolhe `Geral/equipe`, cria tarefa geral pelo endpoint interno com `source=miauby_whatsapp`. Listagens sao buscadas em `GET /tarefa/api/internal/tasks/visible`: usuario comum recebe tarefas do ADM para voce, minhas tarefas e tarefas gerais; ADM/admin recebe tarefas que voce criou, tarefas gerais e tarefas por usuario. Comandos com data simples (`amanha 15h`, `sexta cedo`, `dd/mm`) enviam `remind_at` quando a tarefa e privada para um usuario; tarefa geral continua sem disparo automatico imediato. Consultar tarefa nao exige responsavel humano; concluir/cancelar tarefa pelo perfil `farmacia` pergunta primeiro quem esta fazendo a acao e depois usa a permissao desse usuario para buscar, listar ambiguidades e pedir SIM/NAO final. Quando ha varias candidatas, o bridge lista opcoes agrupadas e guarda pendencia de escolha por numero, ordinal, grupo (`a geral`, `adm 1`, `minha 2`), usuario ou trecho do titulo. Depois da escolha, concluir/cancelar ainda exige SIM/NAO final; `cancela` confirma quando a pergunta e `Confirma cancelar`, enquanto `nao cancela` ou `cancela comando` desiste. Usuario comum nao pode cancelar tarefa criada/delegada por ADM. A execucao final chama `POST /tarefa/api/internal/tasks/status`, cancela lembretes pendentes quando necessario e grava auditoria em `tarefa_audit_events` e `core_audit_logs`. Ainda em 2026-06-03, avisos automaticos e lembretes manuais foram separados: tarefa privada criada para alguem gera aviso inicial, tarefa ainda aberta agenda acompanhamento diario no dia seguinte, e `remind_at` manual continua disparando exatamente na data/hora pedida. O endpoint `/miauw/whatsapp/internal/task-reminder` usa `reminder_id`/`dedupe_key` e memoria de envio em andamento para devolver `duplicate_task_reminder` sem reenviar quando o mesmo lembrete chega de novo, evitando flood e risco de ban.

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
  -> Evolution API /message/sendText ou /sendWhatsAppAudio, ou Meta text/interactive/audio
  -> Postgres do bridge registra memoria curta sanitizada sem bloquear a fila
```

## Banco de dados

O canal usa Postgres dedicado porque o dominio precisa de fila robusta, deduplicacao, indices parciais, `JSONB` para metadados sanitizados e processamento seguro por `FOR UPDATE SKIP LOCKED`.

Tabelas criadas pelo servico:

- `miauw_whatsapp_contacts`: contatos autorizados/vistos, com telefone em hash, mascara e numero cifrado quando necessario para comparar allowlist, inclusive variacoes brasileiras com/sem nono digito. Pode guardar `linked_user_id`, `linked_username_snapshot`, `linked_by`, `linked_at` e `link_updated_at` para associar o contato a um login interno sem expor telefone cru ao core.
- `miauw_whatsapp_events`: eventos recebidos, status da fila, dedupe por provider/instancia/message id, metadados sanitizados e identificadores cifrados.
- `miauw_whatsapp_outbox`: respostas geradas e tentativas de envio pelo transporte WhatsApp escolhido, incluindo metadados sanitizados quando a resposta planejada foi audio.
- `miauw_whatsapp_contact_modules`: cards/modulos liberados por contato autorizado, como Cashback, Cotacao, Pedidos, Financeiro, Gestao, Tarefas, XP, Codigos e Miauby.
- `miauw_whatsapp_error_logs`: falhas sanitizadas de fila, envio e HTTP, com origem, severidade, trace curto, mascara do contato, resumo e contexto limpo para diagnostico.
- `miauw_whatsapp_automation_runs`: execucoes de automacoes internas, como Tarefa, encomenda da Cotacao e rotinas n8n, com origem, modulo, status, modo notify, dry-run, destinatarios, enviados, falhas, fingerprint e detalhes sanitizados.
- `miauw_whatsapp_channel_events`: memoria curta compartilhada entre Miauby interno e WhatsApp, com resumo sanitizado de entrada/saida, canal, motor, status, trace, hash/mascara do contato e metadados limpos.

O bloqueio por ferias usa tabelas do Postgres core, nao o banco dedicado do bridge:

- `core_user_vacations`: periodo, status e marcas dos avisos de inicio/retorno.
- `core_user_vacation_events`: eventos de cadastro, limpeza e processamento.
- `core_user_vacation_message_logs`: mensagens automaticas bloqueadas por ferias e avisos enviados/falhos.

O banco nao deve guardar payload bruto externo, telefone cru em texto aberto ou bytes de audio/midia. O servico guarda hash/mascara para auditoria e cifra os identificadores necessarios para responder; o painel logado pode decifrar o telefone apenas na area de edicao da allowlist. Para audio, foto, print, imagem e PDF/documento, `payload_summary.media` guarda apenas tipo, provider, chave/id da midia e sinais como mime/duracao/tamanho quando disponiveis; para comprovantes Pix, quando o transporte fornece `fileSha256` ou equivalente, o bridge guarda somente um hash salgado desse identificador para detectar repeticao, nunca a midia bruta. A midia e baixada do transporte somente durante o processamento, enviada ao Gemini para transcricao/extracao e descartada em memoria.

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
- `MIAUW_WHATSAPP_COTACAO_INTERNAL_BASE_URL=http://wimifarma-cotacao-app:3000/cotacao`
- `MIAUW_WHATSAPP_COTACAO_INTERNAL_TOKEN` ou `COTACAO_INTERNAL_TOKEN` para o painel consultar status de encomendas da Cotacao
- `MIAUW_WHATSAPP_FINANCEIRO_INTERNAL_BASE_URL=http://wimifarma-financeiro-app:3800/financeiro`
- `MIAUW_WHATSAPP_TAREFA_INTERNAL_BASE_URL=http://wimifarma-tarefa-app:3500/tarefa`
- `MIAUW_WHATSAPP_TAREFA_INTERNAL_TOKEN` ou `TAREFA_INTERNAL_TOKEN` para comandos de Tarefas pelo WhatsApp
- O Compose deve repassar `MIAUW_WHATSAPP_TAREFA_INTERNAL_TOKEN` e `TAREFA_INTERNAL_TOKEN` ao `wimifarma-miauw-whatsapp`. Se `miauby tarefas` entrar como evento e terminar `dead` com erro `unauthorized`, a primeira verificacao e o token usado pelo bridge contra `/tarefa/api/internal/tasks/visible`.
- Para avisos automaticos de Tarefa, `TAREFA_MIAUW_WHATSAPP_TIMEOUT_MS=25000` evita timeout antes do anti-flood/provider, e `TAREFA_REMINDER_IN_FLIGHT_GRACE_MINUTES=15` impede que o worker reprocesse a mesma tentativa enquanto ela ainda pode estar em andamento.
- `MIAUW_WHATSAPP_AUTOMATION_NOTIFY_COOLDOWN_MINUTES=15`
- `MIAUW_WHATSAPP_WATCHDOG_LOOKBACK_MINUTES=30`
- `MIAUW_WHATSAPP_WATCHDOG_STUCK_MINUTES=2`
- `MIAUW_WHATSAPP_WATCHDOG_SLOW_TOTAL_MS=30000`
- `MIAUW_WHATSAPP_SMOKE_CHECK_TIMEOUT_MS=6000`
- `MIAUW_WHATSAPP_EVOLUTION_BAILEYS_ALERT_LOOKBACK_MINUTES=120`
- `MIAUW_WHATSAPP_PIX_OCR_SUMMARY_LOOKBACK_HOURS=24`
- `MIAUW_WHATSAPP_OUTBOX_RECOVERY_BATCH_SIZE=3`
- `MIAUW_WHATSAPP_OUTBOX_RECOVERY_MAX_AGE_MINUTES=30`
- `MIAUW_WHATSAPP_VACATION_NOTICE_INTERVAL_MS=3600000`
- `CORE_POSTGRES_HOST`
- `CORE_POSTGRES_PORT=5432`
- `CORE_POSTGRES_DB=wimifarma_core`
- `CORE_POSTGRES_USER=wimifarma_core`
- `CORE_POSTGRES_PASSWORD`
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

- `GET /miauw/whatsapp/`: painel operacional seguro com canal, transporte, fila, outbox, allowlist, status de OCR Pix CNPJ, n8n automacoes, demora de resposta e eventos recentes, sem segredo nem payload bruto; quando `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` estao preenchidos, exige login por cookie assinado. A allowlist do painel logado mostra e edita o telefone completo decifrado para operacao, e a Sincronia recente pode mostrar o numero completo resolvido por alias para conferir se a Evolution entregou LID ou telefone real.
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
- `POST /miauw/whatsapp/internal/integration-status`: endpoint interno tokenizado para auditoria da integracao Miauby interno x Miauby WhatsApp. Ele nao envia mensagem real e nao executa escrita operacional; consulta dados reais do Postgres do bridge, testa `agent-context.php`, testa `/internal/memory`, testa o health do `wimifarma-miauw-agent`, resume fila/outbox, ultima mensagem enviada, ultimo evento de memoria e ultima falha acionavel.
- `POST /miauw/whatsapp/internal/evolution-status`: endpoint interno tokenizado para auditoria do transporte Evolution API. Ele nao envia mensagem real; consulta `connectionState`, `webhook/find`, pausa do provider e dados reais de fila/outbox/eventos do provider `evolution`, retornando URL de webhook sem query/token, metadados da ultima mensagem enviada, ultimo evento recebido e ultima falha atual sem telefone cru nem conteudo textual da mensagem.
- `GET /miauw/whatsapp/internal/allowlist/by-user`: endpoint interno por token de cabecalho para listar contatos vinculados a um `core_users.id`, retornando somente dados seguros (`id`, mascara, nome, status, cards e snapshot do usuario).
- `POST /miauw/whatsapp/internal/allowlist/link-user`: endpoint interno por token de cabecalho para criar/reativar contato de allowlist, ajustar cards liberados e vincular ao usuario do core. Nao aceita LID protegido por alias como contato editavel.
- `POST /miauw/whatsapp/internal/allowlist/update-user-display-name`: endpoint interno por token de cabecalho para atualizar o nome exibido dos contatos ja vinculados a um `core_users.id`, sem receber telefone cru. O painel Usuarios usa esse endpoint quando `core_users.display_name` muda e o usuario ja tem WhatsApp vinculado.
- `POST /miauw/whatsapp/internal/allowlist/unlink-user`: endpoint interno por token de cabecalho para remover o vinculo de usuario e bloquear o contato salvo no Postgres do bridge. LIDs protegidos por alias nao podem ser removidos por esse fluxo.
- `POST /miauw/whatsapp/internal/smoke-check`: endpoint interno tokenizado para n8n/pos-deploy. Roda checks de health do bridge, proxy Apache, core Miauby, Gestao, Pedidos, Cotacao, widget e conexao Evolution; aceita `notify=never|problems|always` no JSON ou query. Quando notifica, envia apenas para contatos reais autorizados com card `Miauby`, respeitando cooldown e bloqueando LIDs protegidos.
- `POST /miauw/whatsapp/internal/watchdog`: endpoint interno tokenizado para n8n/monitoramento. Verifica fila travada, outbox `pending/sending`, falhas recentes, respostas lentas, envios `sent` sem id do provedor, pausa do transporte e conversas que receberam `sent` mas ficaram com nova mensagem sem resposta; aceita `notify=never|problems|always`.
- `POST /miauw/whatsapp/internal/evolution-baileys-alert`: endpoint interno tokenizado para n8n chamar a cada 30 min. Verifica sinais seguros da Evolution/Baileys pelo bridge, como conexao nao aberta, provedor pausado e outbox `failed/dead` recente no provider `evolution`; aceita `notify=never|problems|always`, `dry_run=true` e `lookback_minutes`. Esse endpoint nao executa shell nem le Docker logs; o script `ops/evolution/check-baileys-init-timeouts.sh` continua como runbook de host.
- `POST /miauw/whatsapp/internal/pix-ocr-daily-summary`: endpoint interno tokenizado para n8n chamar todo dia. Resume eventos/logs sanitizados de comprovante Pix por midia, destacando falhas OCR, campos faltando e destino divergente; aceita `notify=never|problems|always`, `dry_run=true` e `lookback_hours`. Envia apenas para contatos reais com card `Financeiro` quando houver problema, sem criar lancamento ou confirmar Pix.
- `POST /miauw/whatsapp/internal/pedidos-arrival-check`: endpoint interno tokenizado para n8n chamar todo dia as 17h. Consulta `GET /pedidos/api/internal/arrival-summary`, respeita o toggle `Chegada de pedidos` no painel, envia a lista de pedidos aguardando chegada para contatos reais com card `Pedidos` em formato de tabela numerada com valor total do pedido e aceita `dry_run=true` para validar sem enviar.
- Comandos manuais de Pedidos no WhatsApp usam tambem `GET /pedidos/api/internal/cancel-candidates` e `POST /pedidos/api/internal/cancel-order`; ambos sao tokenizados, revalidam `actor_user_id`/permissao no app Pedidos e nao expoem telefone, token ou payload bruto.
- `POST /miauw/whatsapp/internal/financeiro-cash-closing-reminder`: endpoint interno tokenizado para n8n chamar todo dia as 18h. Consulta `GET /financeiro/api/internal/cash-closing-status`, respeita o toggle `Fechamento de caixa` no painel e envia lembrete para contatos reais com card `Financeiro` quando houver caixa em aberto, em conferencia ou sem registro nos ultimos 10 dias ate o dia consultado. A mensagem vai em bloco com quebras de linha, destaca o dia consultado, lista um caixa por linha e termina com a acao operacional. Se tudo estiver finalizado, `notify=always` envia uma confirmacao curta de tudo certo; `notify=problems` continua sem mensagem.
- `POST /miauw/whatsapp/internal/cotacao-encomenda-reminder`: endpoint interno tokenizado chamado pela Cotacao quando um lembrete de encomenda vence. Se o payload trouxer `recipients`, `destinatarios` ou `phones`, esses numeros funcionam apenas como filtro e precisam existir como contatos `allowed` com card `Cotacao` liberado; numeros fora da allowlist/card sao ignorados e registrados apenas de forma mascarada na execucao da automacao.
- `POST /miauw/whatsapp/internal/vacation-check`: endpoint interno tokenizado para conferir e processar avisos de inicio/retorno de ferias. Aceita `dry_run=true` para validar sem enviar. O worker interno tambem roda essa checagem periodicamente por `MIAUW_WHATSAPP_VACATION_NOTICE_INTERVAL_MS`.
- `POST /miauw/agent-context.php`: endpoint PHP interno, protegido por `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`, usado pelo bridge para exportar `style_context`, `identity_context`, treino aprovado, perfil de voz, `channel_memory` e contratos de tools do Miauby interno antes de chamar o agent.
- `POST /miauw/agent-memory.php`: endpoint PHP interno de compatibilidade, protegido pelo mesmo token. Ele tenta usar a ponte Postgres do bridge e cai para `miauw_channel_events` no MySQL somente se a ponte estiver indisponivel. Aceita `record`, `record_batch` e `recent`; deve receber somente texto resumido/sanitizado, hash/mascara e metadados limpos.
- `POST /miauw/agent-actions.php`: endpoint PHP interno, protegido pelo mesmo token, usado pelo bridge para preparar acoes fortes permitidas e executar somente depois de confirmacao pendente no WhatsApp.

O webhook aceita token por `Authorization: Bearer`, `X-Miauw-Whatsapp-Token`, `X-Webhook-Token`, `X-Evolution-Webhook-Token` ou query `?token=...`, para compatibilidade com configuracoes diferentes da Evolution API. No modo Meta, `GET` usa `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `POST` deve usar `X-Hub-Signature-256` com `META_WHATSAPP_APP_SECRET`.

## Regras iniciais

- O repositorio mantem o servico desligado por `MIAUW_WHATSAPP_ENABLED=false`; cada ambiente pode ligar por `.env`.
- Com o servico ligado, `MIAUW_WHATSAPP_WEBHOOK_TOKEN` e uma chave de cifragem precisam estar configurados.
- O painel `/miauw/whatsapp/` deve ficar protegido por `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` nos ambientes operacionais. Health continua publico e sem segredo para smoke test.
- Mesmo protegido por login, o painel nao deve exibir segredos nem payload bruto. Telefone completo pode aparecer apenas na edicao da allowlist e na Sincronia recente do painel logado, para auditoria operacional do remetente resolvido; status publico, health e logs recentes continuam com mascara/hash.
- A allowlist fixa por `MIAUW_WHATSAPP_ALLOWED_SENDERS` continua sendo a base por ambiente. O painel tambem permite autorizar/bloquear contatos no Postgres; bloqueio salvo no Postgres vence sobre a allowlist fixa, e autorizacao salva no Postgres permite adicionar remetentes sem editar `.env`. A comparacao de numero aceita equivalencia operacional com/sem DDI brasileiro `55` e com/sem o nono digito depois do DDD, para evitar bloqueio indevido quando Evolution/Baileys entrega formatos diferentes. O cadastro aceita formatos como `44997641531`, `44 99764 1531`, `997641531` e `97641531`; se faltar DDD, o bridge usa `MIAUW_WHATSAPP_DEFAULT_DDD`, e se faltar DDI o bridge normaliza para `55` por padrao operacional do Brasil. Numeros de outro pais devem ser cadastrados completos.
- Cada contato salvo no Postgres pode ter cards/modulos liberados. Ao pedir `miauby menu`, `miauby cards` ou equivalente, o bridge retorna apenas os cards autorizados para aquele telefone, considerando hash direto, alias da Evolution e equivalencia operacional com/sem DDI `55`. O bridge tambem bloqueia chamadas do core/tools quando o card detectado na mensagem ou na tool retornada nao esta liberado para o telefone.
- Quando um contato e vinculado a um usuario pelo modulo Usuarios, os avisos individuais e as acoes confirmadas devem usar esse vinculo como referencia operacional. O painel Usuarios usa `core_users.display_name` como nome padrao do contato quando existir. O bridge envia `user_context` com `core_users.id`, `username`, `display_name`, `role`, origem `whatsapp_link`, hash e mascara para o Miauby interno, para memoria curta e para `agent-actions.php`; se o usuario comum mandar uma sangria/PIX sem responsavel textual, o nome exibivel do vinculo e usado como responsavel. Se a mensagem trouxer outro nome, o vinculo do numero comum continua vencendo para evitar registro em nome de terceiro. A excecao e `role=farmacia`: o numero institucional nunca vira responsavel humano automatico e deve escolher/resolver um usuario ativo antes de gravar sangria, Pix CNPJ, pedido ou outro lancamento que exija responsavel. O numero completo continua cifrado no bridge; o core deve usar apenas o `contact_id` e a mascara. Se o mesmo telefone for vinculado a outro usuario, o novo vinculo substitui o dono operacional.
- Remover um numero pelo painel Usuarios bloqueia o contato no bridge, evitando disparos futuros por allowlist, e apaga o vinculo seguro do core. Para apenas trocar cards sem bloquear, usar edicao normal da allowlist no painel WhatsApp.
- Ferias do usuario nao removem allowlist, nao bloqueiam conversa manual e nao bloqueiam login. O filtro de ferias atua apenas em mensagens automaticas originadas pelo backend. Lembretes de Tarefas bloqueados por ferias voltam como `skipped` para o app Tarefa, evitando retry infinito.
- Grupos ficam bloqueados por padrao.
- Remetente fora da allowlist nao chama Gemini nem core Miauby, nao executa comandos, nao consulta modulos e nao registra acao operacional. Quando envia texto individual, o bridge registra o evento como `ignored/sender_not_allowed`, guardando hash/mascara/cifra do numero, data/hora e mensagem recebida de forma interna, e manda no maximo um aviso curto a cada 10 minutos: `Oiee! Miauby aqui!😼 Esse WhatsApp é só para a equipe interna da Wimifarma. Se você precisa falar com a farmácia, chame no canal oficial de atendimento (44) 98413-4971.`
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
- Quando `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true`, o bridge pode preparar acoes fortes permitidas em `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST`, guardar uma pendencia por remetente, expirar pendencias antigas e pedir `Sim`/`Nao` sem expor codigo curto ao usuario. Meta Cloud API envia botoes interativos quando `MIAUW_WHATSAPP_INTERACTIVE_CONFIRMATIONS=true`; Evolution/Baileys envia confirmacao forte sempre em texto simples, mesmo que `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS=true` esteja configurado por engano, porque `sendButtons` pode retornar sucesso e aparecer no WhatsApp Web como mensagem que nao carrega. Sem pendencia valida, clique, `sim`, `nao`, `confirmar` ou `cancelar` sao apenas texto e nao executam escrita.
- Dados sensiveis continuam bloqueados localmente antes de chamar Gemini/core.
- Saudacoes simples como `oi`, `ola`, `teste`, `status` e `ajuda` respondem localmente, de forma super curta, sem chamar Gemini/core para reduzir latencia. Pedidos claramente fora do Miauby, como receita/bolo, filme, piada ou assunto amplo sem relacao operacional, tambem podem ser bloqueados localmente com resposta curta antes de gastar Gemini. O comando `miauby n8n` tambem responde localmente com as automacoes previstas e o que depende dos cards liberados para aquele numero.
- Audio fica desligado por padrao no Git. Quando `MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED=true`, audio individual de remetente autorizado e baixado do transporte apenas no worker, limitado por `MIAUW_WHATSAPP_AUDIO_MAX_BYTES`, transcrito pelo Gemini e descartado. A transcricao passa por validacao antes do roteador: texto vazio, glossario/seed inventado ou texto implausivel para a duracao do audio e bloqueado com resposta curta, sem consultar modulo e sem executar comando. Transcricao valida segue o mesmo roteador: conversa simples vai para Gemini; comando operacional detectado chama o core/tools conforme permissao quando o ambiente permite comandos sem prefixo.
- Quando `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=true`, o bridge pode gerar audio de resposta. O modo `voice_on_voice` responde em audio somente quando a entrada veio por audio; `always` tenta audio para toda resposta sem botao; `never` desliga. Confirmacoes continuam por botoes/texto, nao por audio. Respostas faladas repetidas podem ser reaproveitadas em memoria por `MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS`.
- Com `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`, foto, print, imagem encaminhada ou PDF/documento individual de remetente autorizado pode ser tratado como comprovante Pix. O destino precisa bater com o CNPJ/chave Pix `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ` ou com um nome correlato configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES`; assim, comprovantes sem CNPJ visivel ainda podem passar se o nome da empresa for reconhecido. Antes do OCR, o bridge aplica um filtro leve em legenda/nome/extensao: imagem/PDF sem pista negativa continua indo para leitura, mas arquivo claramente fora de formato ou legenda como nota fiscal, receita, catalogo ou planilha e respondido com `Isso ai é um comprovante pix?` sem gastar Gemini. Se o OCR extrair um CNPJ de destino diferente do configurado, o bridge bloqueia o lancamento em vez de tentar aceitar por texto bruto. CNPJ encontrado apenas no `raw_text` compacto so vale quando estiver em contexto de destino, recebedor, favorecido ou chave Pix. O contato precisa ter card `Financeiro` liberado e a gravacao continua exigindo pendencia `Sim`/`Nao`. Se faltar valor ou pagador, ou se o destino nao bater por CNPJ/chave/nome, o bridge nao grava e pede os dados corrigidos por texto. Data/hora extraidas entram no lancamento; na correcao manual sem data/hora, o sistema usa o momento atual.

## Modo hibrido de IA

`MIAUW_WHATSAPP_AI_MODE` controla o motor de resposta:

- `miauw`: todas as respostas passam pelo `wimifarma-miauw-agent`, usando o core interno e a OpenAI configurada no Miauby.
- `gemini`: conversa curta passa pelo Gemini; mensagens que parecem comando interno continuam protegidas e podem ser roteadas ao core Miauby quando ele estiver configurado.
- `hybrid`: conversa solta passa pelo Gemini quando `GEMINI_API_KEY` estiver preenchida; mensagens com `miauby`, como `miauby faca sangria`, `miauby pedidos resumo` ou `sangria tal dia miauby`, vao para o `wimifarma-miauw-agent` com tools e guardrails. Quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, comandos operacionais detectados sem `miauby`, como `sangria 10 Will`, tambem vao para o core, sem pular card liberado nem confirmacao.

No caminho do core, `apps/miauw-whatsapp` chama `site/miauw/agent-context.php` por POST interno tokenizado. O pacote retornado e cacheado por poucos segundos e inclui o mesmo `style_context` que o chat interno usa, com treino aprovado, perfil de voz, exemplos relevantes, memoria curta multicanal, contrato de personalidade e `tool_contracts` exportados do registry PHP. Isso evita dois Miaubys com personalidade/capacidades diferentes. No caminho Gemini, apenas a personalidade, perfil de voz, padroes, regras de treino aprovado, exemplos curtos e memoria curta entram como contexto sanitizado para conversa solta; contratos de tools e dados operacionais continuam fora desse caminho.

Dentro da rede Docker, `MIAUW_WHATSAPP_CONTEXT_URL` e endpoints PHP internos devem usar `http://wimifarma-com-web/...`. O `.htaccess` publico redireciona hosts externos para HTTPS, mas isenta o host interno `wimifarma-com-web` para evitar redirect para a porta 443 do container web, que nao existe.

Quando confirmacoes por WhatsApp estiverem ligadas no ambiente, o bridge tenta primeiro `site/miauw/agent-actions.php` para comandos deterministas como financeiro/sangria e Gestao. Se o PHP preparar uma acao forte permitida, o bridge grava a pendencia em `miauw_whatsapp_confirmations` e pede `Sim`/`Nao` por texto simples na Evolution ou botoes interativos na Meta Cloud API. A Evolution nao usa mais `/message/sendButtons/{instance}` para confirmacoes fortes, mesmo com a flag antiga ligada, porque a API pode aceitar botoes sem renderizar no WhatsApp normal/linked device. Ao clicar `Sim` ou responder `sim` com uma pendencia ativa, mesmo sem prefixo `miauby`, o bridge chama `agent-actions.php` em modo `execute` levando o `user_context` do contato vinculado, incluindo nome exibivel e origem do responsavel; ao clicar `Nao` ou responder `nao`, cancela sem gravar. A confirmacao continua auditada pelo PHP/bridge, e as escritas do Financeiro devem passar pelos endpoints internos tokenizados do app Node/Postgres quando `FINANCEIRO_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` estiver configurado.

Com `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=false`, o WhatsApp volta ao comportamento conservador: acoes fortes podem ser entendidas, mas a resposta orienta usar o Miauby interno/sistema para confirmar.

Se o Gemini falhar no modo hibrido, o bridge cai para o core Miauby apenas como fallback tecnico. O contexto enviado ao Gemini deve ser curto e sanitizado; nao enviar telefone completo, payload bruto, token, dados de cliente ou financeiro real. O prompt base do bridge preserva identidade/persona do Miauby, evita inventar horario, saldo, pedido ou dado operacional, pede somente o menor dado faltante e orienta `miauby menu`/card correto quando o assunto precisa do core. O Gemini nao deve desenvolver pedidos aleatorios fora da operacao, como `quero bolo`; nesses casos responde curto que foge do Miauby e oferece os cards da Wimifarma. Para baixa latencia e respostas completas com Gemini 2.5, usar `MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET=0` e `MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS` suficiente. Respostas simples do Gemini podem ficar em cache curto por `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS`, sem payload bruto e sem dados operacionais.

## Audio no WhatsApp

O audio do WhatsApp usa Gemini em duas etapas independentes:

1. Entrada: o bridge guarda somente referencia sanitizada da midia recebida. No processamento da fila, ele baixa a midia via Evolution `/chat/getBase64FromMediaMessage/{instance}` ou via Media API da Meta, envia para `MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_MODEL` e usa apenas a transcricao validada para seguir no roteador. Se a transcricao parecer chute/glossario interno, o evento recebe metadado sanitizado de falha e o usuario recebe `Nao consegui entender bem esse audio. Me manda em texto ou grava de novo falando uma frase clara.`.
2. Saida: se `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=true`, a resposta textual ja validada vira fala por `MIAUW_WHATSAPP_AUDIO_TTS_MODEL`. `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr` e `MIAUW_WHATSAPP_AUDIO_TTS_STYLE` orientam uma voz mais aguda, brilhante e levemente felina para o Miauby, sem clonagem de voz ou imitacao de pessoa real. Quando o Gemini devolve PCM, o bridge empacota como WAV antes de enviar. Se envio de audio falhar, cai para texto pelo mesmo transporte e registra `provider_reply_fallback` em `miauw_whatsapp_error_logs`.

O audio nao substitui guardrails. Escritas fortes seguem exigindo pendencia e confirmacao; mensagens de audio sem dados suficientes devem pedir o menor dado faltante; `sim/nao` por audio so tem efeito se a transcricao encontrar uma pendencia valida. Toda alteracao futura de comando no Miauby WhatsApp tambem precisa considerar o caminho de audio, porque audio confiavel vira texto e deve passar pelo mesmo parser local/roteador, enquanto audio duvidoso nunca deve virar comando.

O painel `/miauw/whatsapp/` mostra motor usado (`local`, `blocked`, `gemini`, `gemini_cache` ou `miauw`), motivo da rota, latencia de geracao antes do envio e demora total entre recebimento do evento e envio pelo transporte. Essa telemetria fica na `miauw_whatsapp_outbox`/consulta com `miauw_whatsapp_events` e usa mascaras/hash fora da edicao da allowlist; a Sincronia recente, por ser painel logado, mostra o telefone completo resolvido por `MIAUW_WHATSAPP_RECIPIENT_ALIASES` quando houver alias da Evolution. O painel tambem mostra graficos simples de media/p95 por motor, uma visao de sincronia recente comparando mensagem recebida e resposta enviada em blocos visuais com chips de evento/outbox/motor/tempo, allowlist minimizada por padrao com telefone completo editavel, eventos/outbox recentes com chips operacionais e uma area de erros abertos alimentada por `miauw_whatsapp_error_logs`. Desde 2026-05-29, os blocos `Configuracao` e `Estados` usam cards operacionais com chip de status, detalhes separados e tons visuais por severidade, mantendo os mesmos dados seguros sem exibir segredo ou payload bruto. Desde 2026-05-30, o card `Problemas` ignora outbox `dead` com `error_summary='stale_pending_expired'`, porque essas linhas representam expiracao segura de pendencia velha e nao falha atual. A lista de `Erros abertos` tambem ignora logs `info`, usados como auditoria/cooldown de automacoes bem-sucedidas, avisos de recuperacao segura de outbox antigo e avisos transitorios `queue_event` cujo evento ja terminou como `replied`; quando uma tentativa temporaria volta a responder com sucesso, o worker marca esse aviso como resolvido.

Desde 2026-06-02, o painel tambem mostra o card `Integracao Miauby`, calculado com dados reais de runtime, fila, outbox e erros acionaveis. Para auditoria mais completa, usar `POST /miauw/whatsapp/internal/integration-status` com token interno. Esse endpoint consolida:

- configuracao viva do bridge, transporte, contexto e memoria;
- contagens reais de `miauw_whatsapp_events` e `miauw_whatsapp_outbox`;
- outbox atual com problema, ignorando `dead/stale_pending_expired` como falha ativa;
- erros acionaveis abertos em `miauw_whatsapp_error_logs`;
- ultima mensagem enviada, sem telefone cru nem payload bruto;
- ultimo evento de memoria em `miauw_whatsapp_channel_events`;
- chamada ativa a `site/miauw/agent-context.php`;
- chamada ativa a `/miauw/whatsapp/internal/memory`;
- health do `wimifarma-miauw-agent`.

O status de integracao nao substitui smoke/watchdog: smoke valida varios servicos do ecossistema e watchdog procura travas operacionais; `integration-status` responde especificamente se Miauby interno e Miauby WhatsApp estao conseguindo trocar contexto/memoria e se a fila/outbox esta saudavel. A chamada nao envia mensagem real pelo WhatsApp, nao chama provider externo e nao altera fluxo de resposta.

Desde 2026-06-02, o painel tambem mostra o card `Evolution API`, que aponta para o check interno `POST /miauw/whatsapp/internal/evolution-status`. Esse endpoint e o caminho rapido para saber se a Evolution esta conectada, se o webhook da instancia aponta para `/miauw/whatsapp/webhook`, se `MESSAGES_UPSERT` esta habilitado, se o provider esta pausado e se existem pendencias/falhas atuais na outbox `evolution`. Ele nao expoe `EVOLUTION_API_KEY`, token do webhook, telefone cru, conteudo textual da mensagem nem payload bruto, e tambem nao dispara envio real.

O painel tambem mostra `n8n automacoes`: Chegada de pedidos, Fechamento de caixa, Pedidos e boletos, Financeiro, Deploy/checks e Miauby + n8n. Desde 2026-05-29, essa area separa visualmente status da stack, fluxo seguro (`n8n agenda -> backend valida -> WhatsApp avisa`) e cards das rotinas com Quando, Card, Destino, o que o n8n chama, o que o Miauby faz, exemplo de mensagem/estilo, Limite e Controle. Desde 2026-06-01, o card `Fechamento de caixa` mostra tambem `Status agora`, lendo o Financeiro quando possivel para indicar se existe caixa aberto nos ultimos 10 dias e qual dia esta pendente. Desde 2026-06-02, o card `Encomenda da Cotacao` tambem mostra `Status agora`, lendo `GET /cotacao/api/internal/encomenda-reminders/status` para exibir worker, ultima varredura, vencidos agora, proximo pendente, ultima tentativa e ultimo erro sem disparar envio. O destino de cada rotina e calculado pelos cards liberados para contatos autorizados reais; LIDs da Evolution protegidos por alias nao entram como destinatarios. n8n apenas orquestra/agenda, enquanto permissao, dados, escrita forte e auditoria continuam no backend Wimifarma. As rotinas `Chegada de pedidos` e `Fechamento de caixa` tem box de controle `Ligado/Desligado` no painel, com botao `Desativar`/`Ativar`; n8n pode continuar agendado, mas o bridge ignora a execucao quando elas estiverem pausadas. Para operacao atual, n8n deve chamar os endpoints internos `smoke-check`, `watchdog`, `evolution-baileys-alert`, `pix-ocr-daily-summary`, `pedidos-arrival-check`, `financeiro-cash-closing-reminder` e `cotacao-encomenda-reminder`; o bridge calcula os destinatarios, valida qualquer destinatario explicito da Cotacao contra allowlist/card `Cotacao`, registra cada execucao em `miauw_whatsapp_automation_runs`, registra em `miauw_whatsapp_error_logs` apenas falhas acionaveis e aplica cooldown pela tabela de automacoes onde for alerta para nao floodar a equipe. Perguntas como `miauby em pedidos o que falta chegar` sao respondidas localmente pelo bridge com a mesma tabela da rotina, sem depender de Gemini/core, desde que o contato tenha card `Pedidos`. O worker tambem recupera outbox `pending` recente em lote pequeno e expira pendencias antigas por `MIAUW_WHATSAPP_OUTBOX_RECOVERY_MAX_AGE_MINUTES`, evitando mensagens velhas fora de contexto depois de queda/redeploy.

Desde 2026-05-29, o smoke-check executa os checks de health/proxy/core/Evolution em paralelo para nao somar todos os timeouts em uma chamada do n8n. O watchdog so considera `queued`/`pending` como travado quando `next_attempt_at` ja venceu; mensagens aguardando backoff normal nao devem gerar alerta. Se o transporte estiver em pausa por erro temporario, o worker falha rapido o envio e agenda retry com backoff, em vez de ficar bloqueado em `processing`/`sending` ate a recuperacao reprocessar a mesma mensagem.

Quando a Evolution/Baileys entregar remetente como LID/identificador longo em vez do telefone E.164, usar `MIAUW_WHATSAPP_RECIPIENT_ALIASES` no `.env` para mapear identificador recebido para telefone real autorizado, no formato `origem=destino`, separado por virgula quando houver mais de um. Essa configuracao fica fora do Git. Exemplo: se o painel tem `5544984134971`, mas o evento chega como `234668507005157@lid`, configurar `234668507005157=5544984134971`. A checagem de cards liberados deve considerar o identificador recebido e o telefone alias-resolvido, para que o mesmo contato mantenha permissoes de comandos internos no WhatsApp. No painel, esses LIDs ficam ocultos e protegidos contra edicao, bloqueio ou reautorizacao manual; o operador deve ajustar apenas o telefone real vinculado. Desde 2026-05-29, novas mensagens ja entram no bridge com o remetente canonico quando o alias existir, e a Sincronia recente tambem resolve linhas antigas para mostrar o numero real no painel logado.

## Comprovante Pix CNPJ por midia

O fluxo de comprovante Pix por midia e opcional e desligado no Git. Quando `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`, o bridge aceita foto, print, imagem encaminhada ou PDF/documento de remetente em allowlist, mas confere antes se o contato tem card `Financeiro` liberado. So depois disso aplica o filtro rapido por legenda/nome/extensao; se ainda parecer candidato, confere repeticao por hash salgado do arquivo quando disponivel; entao baixa a midia no worker, envia ao Gemini configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL` e espera um JSON com comprovante Pix, CNPJ/chave destino, nome destino, pagador, valor, data, horario, instituicao, ID Pix/E2E quando existir, texto OCR compacto, confianca geral e confianca por campo. Se o filtro rapido ou a extracao concluir que a imagem nao parece Pix, responde apenas `Isso ai é um comprovante pix?` e nao cria pendencia. A flag manteve `IMAGE` no nome por compatibilidade com ambientes ja configurados, mas o comportamento cobre tambem PDF/documento. Desde 2026-05-29, legenda/mensagem enviada junto e nome do arquivo entram como pistas de leitura, o prompt pede para ignorar saldo/limite/tarifa/agencia/conta como valor pago, e o backend tenta fallback deterministico de valor/data/hora a partir do `raw_text` retornado quando o JSON vier parcial. Desde 2026-06-01, o banco continua sem guardar `raw_text` completo, mas guarda resumo sanitizado da tentativa, incluindo motivo de aceite/recusa, score de destino, campos lidos, confiancas, decisao do filtro rapido e duplicidade por arquivo/ID Pix/E2E quando ocorrer, para auditoria operacional.

Para gravar, todos estes pontos precisam passar:

- a mensagem veio de contato autorizado;
- o contato tem card `Financeiro` liberado;
- a midia foi identificada como comprovante Pix;
- o destino bate por CNPJ extraido, chave Pix extraida ou nome correlato configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES` com score minimo `MIAUW_WHATSAPP_PIX_RECEIPT_MIN_TARGET_SCORE_X100`; se o CNPJ de destino extraido for diferente do configurado, a leitura e recusada;
- existem valor e pagador com confianca suficiente; data e horario entram quando extraidos, mas nao bloqueiam a correcao manual curta;
- se houver ID Pix/E2E ou hash de arquivo ja tratado nos ultimos 90 dias, o bridge nao cria nova confirmacao e responde que o comprovante parece repetido;
- `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true` no ambiente e `criar_lancamento_financeiro` esta na allowlist de tools confirmaveis.

Quando passa, o bridge transforma a extracao em comando interno `pix cnpj R$ valor - pagador - obs ...`, chama `site/miauw/agent-actions.php` para preparar a acao e envia uma confirmacao `Sim`/`Nao` para numeros de funcionario comum. O comando e a pendencia mantem os detalhes completos sanitizados, mas a mensagem de confirmacao ao contato usa resumo curto (`PIX CNPJ encontrado: valor - responsavel - data/hora`). Para o perfil `Farmacia`, o fluxo e diferente: a extracao aceita monta um comando `pix_cnpj` sem responsavel publico, guarda data/destino/instituicao/ID Pix em auditoria e abre `selecionar_responsavel_whatsapp`; a resposta final apos escolher usuario fica curta (`PIX CNPJ lancado: R$ 28,90 - Sueli.`). Com Meta Cloud API, botoes interativos podem ser usados. Com Evolution API, a confirmacao e sempre texto simples (`Responda SIM para gravar ou NAO para cancelar`) porque `sendButtons` pode retornar sucesso sem renderizar no WhatsApp normal/linked device. `Sim` grava no Financeiro Node/Postgres como lancamento `Pix CNPJ` por endpoint interno tokenizado e responde curto (`PIX CNPJ lançado: valor - responsavel - data/hora`); `Nao` cancela e orienta escrever os dados corrigidos como `miauby pix cnpj 28,90 sueli`. O typo `pix cpnj` tambem e aceito. Texto manual que ja vem nesse formato e parseado localmente e grava pelo endpoint interno do Financeiro sem passar pelo Gemini, desde que card, responsavel e permissao estejam OK. Textos internos como `Miauby criou a categoria ... por comando interno` nao devem ser despejados no WhatsApp; quando aparecerem em resposta publica, sao resumidos para `Miauby - Categoria criada: ...`.

Midia de grupo continua bloqueada enquanto `MIAUW_WHATSAPP_GROUPS_ENABLED=false`. Se a rotina de comprovantes estiver em grupo, a postura recomendada e encaminhar o comprovante para o Miauby individual ou criar um numero/instancia separado, porque habilitar grupos amplia muito o risco de resposta indevida.

## Anti-flood e risco de bloqueio

Nao existe garantia tecnica de banimento zero, principalmente quando o transporte usa sessao WhatsApp Web/Baileys pela Evolution API. A postura operacional do Wimifarma deve ser conservadora:

- usar apenas remetentes em allowlist e com consentimento operacional claro;
- manter prefixo `miauby` exigido enquanto o canal estiver em estabilizacao; se desligar prefixo e liberar comandos sem prefixo, limitar a allowlist, manter grupos bloqueados e monitorar o painel para garantir que apenas conversa solta va ao Gemini e comandos internos virem confirmacao auditada;
- bloquear grupos por padrao;
- responder somente a mensagens iniciadas pelo usuario autorizado;
- manter uma resposta por mensagem recebida;
- usar respostas curtas, sem campanhas, disparos em massa ou mensagens repetidas;
- bloquear repeticao recente da mesma automacao/lembrete por origem + fingerprint/dedupe, inclusive quando `notify=always`, para que retry ou loop de n8n/app nao envie a mesma mensagem varias vezes;
- respeitar pedidos para parar contato;
- preferir Meta Cloud API oficial quando o objetivo deixar de ser uso interno controlado e virar atendimento amplo.

Para o VPS em producao inicial, recomenda-se comecar ainda mais restrito que o default do repositorio: `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=60`, `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=2500`, `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=5500` e `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=7000`. Esses limites podem subir depois de alguns dias sem erro, bloqueio, report ou queda de qualidade.

## Diagnostico rapido quando nao responde

Para auditar especificamente a ponte Miauby interno x Miauby WhatsApp no VPS, sem imprimir token e sem enviar mensagem real:

```bash
cd /home/ubuntu/projetos/wimifarma-com
docker exec -i wimifarma-miauw-whatsapp node - <<'NODE'
(async () => {
  const token = process.env.MIAUW_WHATSAPP_INTERNAL_TOKEN || process.env.MIAUW_AGENT_INTERNAL_TOKEN || process.env.MIAUW_GUARDIAN_TOKEN || '';
  const response = await fetch('http://127.0.0.1:3400/miauw/whatsapp/internal/integration-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-miauw-agent-token': token,
    },
    body: JSON.stringify({}),
  });
  const data = await response.json();
  console.log(JSON.stringify({
    http_status: response.status,
    ok: data.ok,
    status: data.status,
    checks: data.checks,
    queue: data.snapshot && data.snapshot.queue,
    outbox: data.snapshot && data.snapshot.outbox,
    last_sent_message: data.snapshot && data.snapshot.last_sent_message,
    last_failure: data.snapshot && data.snapshot.last_failure,
  }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
```

Para auditar especificamente a Evolution API usada pelo bridge, tambem sem imprimir segredo e sem enviar mensagem real:

```bash
cd /home/ubuntu/projetos/wimifarma-com
docker exec -i wimifarma-miauw-whatsapp node - <<'NODE'
(async () => {
  const token = process.env.MIAUW_WHATSAPP_INTERNAL_TOKEN || process.env.MIAUW_AGENT_INTERNAL_TOKEN || process.env.MIAUW_GUARDIAN_TOKEN || '';
  const response = await fetch('http://127.0.0.1:3400/miauw/whatsapp/internal/evolution-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-miauw-agent-token': token,
    },
    body: JSON.stringify({}),
  });
  const data = await response.json();
  console.log(JSON.stringify({
    http_status: response.status,
    ok: data.ok,
    status: data.status,
    checks: data.checks,
    connection: data.connection,
    webhook: data.webhook,
    provider_pause: data.provider_pause,
    queue: data.snapshot && data.snapshot.queue,
    outbox: data.snapshot && data.snapshot.outbox,
    last_received_event: data.snapshot && data.snapshot.last_received_event,
    last_sent_message: data.snapshot && data.snapshot.last_sent_message,
    last_failure: data.snapshot && data.snapshot.last_failure,
  }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
```

Se `/miauw/whatsapp/health` estiver OK, mas o WhatsApp nao responder, primeiro verifique se a mensagem entrou na fila:

```bash
cd /home/ubuntu/projetos/wimifarma-com
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT created_at, event_type, status, ignore_reason, sender_phone_mask, left(body_text,80) FROM miauw_whatsapp_events ORDER BY created_at DESC LIMIT 8;"
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT o.created_at, o.sent_at, o.status, o.reply_engine, o.route_reason, o.reply_latency_ms, ROUND(EXTRACT(EPOCH FROM (o.sent_at - e.created_at)) * 1000)::int AS total_response_ms FROM miauw_whatsapp_outbox o JOIN miauw_whatsapp_events e ON e.id = o.event_id ORDER BY o.created_at DESC LIMIT 8;"
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT created_at, source, module_key, status, recipients_count, sent_count, failed_count, left(error_summary,80) FROM miauw_whatsapp_automation_runs ORDER BY created_at DESC LIMIT 8;"
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT created_at, source, severity, phone_mask, left(error_summary,120), left(message_preview,120) FROM miauw_whatsapp_error_logs WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 8;"
```

Se o evento aparecer como `ignored/sender_not_allowed`, o numero nao passou na allowlist. O bridge compara hash direto, numero cifrado, alias da Evolution e variacoes brasileiras com/sem `55` e com/sem nono digito; se ainda bloquear, editar o telefone completo no painel e conferir se os cards necessarios estao liberados para aquele contato.

Quando a Evolution entrega o remetente como `@lid` configurado em `MIAUW_WHATSAPP_RECIPIENT_ALIASES`, o painel, allowlist, permissoes e auditoria usam o telefone real resolvido. O envio da resposta, porem, deve usar o endereco original do chat quando ele for um alias/LID, para evitar que a Evolution marque a outbox como `sent` mas a resposta apareca em outro chat ou nao apareca para quem mandou `oi`.

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

Em 2026-06-02, o bridge ganhou `POST /miauw/whatsapp/internal/evolution-status` como health interno especifico da Evolution. A checagem usa as variaveis reais `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_API_INSTANCE` dentro do container, consulta `connectionState` e `webhook/find`, mascara a query do webhook e cruza com a outbox/eventos do Postgres. Para producao, este endpoint deve ficar como primeiro check antes de reiniciar a Evolution ou alterar webhook, porque separa falha de conexao, webhook incompleto, pausa de provider e fila/outbox com problema.

Nao atualizar a Evolution API em producao direto para `latest` ou release candidate. Qualquer upgrade deve ser feito primeiro em stack/pasta separada, com backup do Postgres/Redis/instancias, validando manager, `connectionState=open`, webhook, `MESSAGES_UPSERT`, envio de texto e botoes. So promover depois de teste real com o numero/instancia de teste.

O manager operacional, quando necessario, deve ser acessado pelo manager embutido da API em `http://127.0.0.1:8080/manager` via acesso local/tunel. Nao manter container manager separado.

Para reduzir falhas de pareamento QR/codigo na Evolution/Baileys, a stack deve manter cache local, historico/contatos/chats/labels desligados e `CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198`. Esse ajuste evita sobrecarga e erros como `Invalid buffer` durante o login.

Em 2026-05-30, a Evolution no VPS estava conectada (`connectionState=open`) e os logs mostravam timeouts pontuais do Baileys em `executeInitQueries`/`fetchProps`: 5 ocorrencias em 24h e 0 nas 12h mais recentes. Esse erro, quando isolado, nao deve ser tratado como queda do WhatsApp. O runbook seguro e medir antes de reiniciar:

```bash
/home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
LOOKBACK=24h WARN_THRESHOLD=6 CRITICAL_THRESHOLD=12 /home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
```

Se o script voltar `status=ok`, nao fazer nada. Se voltar `status=warn`, acompanhar se ainda entram `MESSAGES_UPSERT` e se a outbox continua `sent`. Se voltar `status=critical` ou a Evolution estiver `open` sem entregar mensagens reais, reiniciar somente `wimifarma-evolution-api`, preservando Postgres/Redis/instancias. Nao atualizar a imagem para `latest` como tentativa rapida: upgrade deve ser validado em stack separada.

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

## Auditoria de 2026-06-03

- Producao foi validada com Evolution `state=open`, webhook ativo, fila e outbox atuais sem pendencia travada.
- O VPS voltou a exigir prefixo operacional: `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`, `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=false` e `MIAUW_WHATSAPP_PREFIX=miauby`.
- Comandos de Tarefas reconhecem `miauby concluir tarefa ...` como conclusao, limpando o texto da busca para usar apenas o trecho da tarefa.
- A auditoria encontrou repeticao antiga de `tarefa_reminder` quando a chave de dedupe vinha vazia; o bridge passou a usar tambem fingerprint da mensagem e trava em memoria para Tarefa, Cotacao, Ferias e automacoes gerais. Automacoes com `notify=always` tambem respeitam guarda de repeticao recente.
- O `.env` do VPS foi ajustado para operacao mais conservadora: `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=60`, `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=6`, `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=5000`, `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=1200` e `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=3500`.
- Nao enviar teste real de WhatsApp sem controle; use dry-run dos endpoints internos para validar automacoes.

## Proximas etapas

1. Conectar o numero por QR/codigo de pareamento.
2. Configurar webhook da instancia.
3. Preencher `MIAUW_WHATSAPP_ALLOWED_SENDERS` com remetentes autorizados.
4. Testar com um remetente em allowlist e prefixo `miauby`.
5. Depois avaliar audio, midias e liberacao controlada sem prefixo.
