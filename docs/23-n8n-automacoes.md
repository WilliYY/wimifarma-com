# 23 - n8n Automacoes

## Objetivo

O n8n deve ser uma camada de automacao e orquestracao externa. Ele nao deve virar fonte de verdade, nao deve gravar dados diretamente nas tabelas de negocio e nao deve substituir as permissoes do Miauby/Apps. Destinatarios devem ser calculados pelos cards dos contatos reais autorizados; LIDs da Evolution mapeados por alias ficam ocultos/protegidos e nao devem receber automacoes diretamente.

Regra de arquitetura:

```text
n8n agenda/webhook -> endpoint interno tokenizado -> backend Wimifarma -> auditoria/confirmacao -> WhatsApp
```

As execucoes ficam registradas em `miauw_whatsapp_automation_runs`, inclusive dry-run, rotina desativada, cooldown, envio, parcial e falha. `miauw_whatsapp_error_logs` fica reservado para falhas acionaveis de fila, transporte, HTTP ou envio individual.

## Stack sugerida

Template versionado:

- `ops/n8n/docker-compose.yml`
- `ops/n8n/.env.example`
- `ops/n8n/workflows/pedidos-chegada-17h.json`
- `ops/n8n/workflows/financeiro-fechamento-caixa-18h.json`
- `ops/n8n/workflows/miauby-smoke-check-pos-deploy.json`
- `ops/n8n/workflows/miauby-watchdog-5min.json`
- `ops/n8n/workflows/evolution-baileys-alerta-30min.json`
- `ops/n8n/workflows/pix-ocr-resumo-diario-1910.json`

O n8n deve rodar separado do Compose principal, com Postgres proprio, porta publicada apenas em `127.0.0.1:5678` e acesso publico somente por proxy/autenticacao quando estiver pronto.

Primeira instalacao/atualizacao no VPS:

```bash
mkdir -p /home/ubuntu/projetos/wimifarma-n8n/workflows
cp /home/ubuntu/projetos/wimifarma-com/ops/n8n/docker-compose.yml /home/ubuntu/projetos/wimifarma-n8n/docker-compose.yml
cp /home/ubuntu/projetos/wimifarma-com/ops/n8n/workflows/*.json /home/ubuntu/projetos/wimifarma-n8n/workflows/
cd /home/ubuntu/projetos/wimifarma-n8n
docker compose config --quiet
docker compose up -d
sudo chown -R 1000:1000 n8n-data workflows
docker compose up -d --force-recreate wimifarma-n8n
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/pedidos-chegada-17h.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/financeiro-fechamento-caixa-18h.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/miauby-smoke-check-pos-deploy.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/miauby-watchdog-5min.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/evolution-baileys-alerta-30min.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/pix-ocr-resumo-diario-1910.json
docker compose exec -T wimifarma-n8n n8n update:workflow --id=pedidos-chegada-17h --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=financeiro-fechamento-caixa-18h --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=miauby-smoke-check-pos-deploy --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=miauby-watchdog-5min --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=evolution-baileys-alerta-30min --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=pix-ocr-resumo-diario-1910 --active=true
docker compose restart wimifarma-n8n
```

Os workflows possuem ID estavel para importacao idempotente. Em n8n 2.22 no modo simples, a importacao por CLI desativa o workflow e a ativacao precisa ser aplicada depois pelo comando `update:workflow`/`publish:workflow`, seguida de restart para o agendador carregar o cron.

Os workflows versionados usam `$env.WIMIFARMA_INTERNAL_BASE_URL` e `$env.MIAUW_GUARDIAN_TOKEN` para nao gravar URL/token diretamente no JSON. Em n8n 2.22, o Compose deve manter `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`; se essa variavel ficar bloqueada, as execucoes aparecem como `error` com `ExpressionError: access to env vars denied` antes de chamar o endpoint do Miauby.

No Windows deste PC, o n8n tambem foi instalado via npm global para uso local, sem iniciar servico por padrao:

```powershell
n8n --version
```

## Variaveis no Miauby WhatsApp

- `MIAUW_WHATSAPP_N8N_ENABLED=false`
- `MIAUW_WHATSAPP_N8N_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_SECRET`
- `MIAUW_WHATSAPP_PEDIDOS_INTERNAL_BASE_URL`
- `MIAUW_WHATSAPP_FINANCEIRO_INTERNAL_BASE_URL`
- `MIAUW_WHATSAPP_EVOLUTION_BAILEYS_ALERT_LOOKBACK_MINUTES`
- `MIAUW_WHATSAPP_PIX_OCR_SUMMARY_LOOKBACK_HOURS`

O painel `/miauw/whatsapp/` mostra se a stack/base e webhook estao configurados, resume o fluxo seguro `n8n agenda -> backend valida -> WhatsApp avisa` e lista as rotinas n8n planejadas em cards com Quando, Card, Destino, o que o n8n chama, o que o Miauby envia/faz, exemplo do estilo da mensagem, Limite e Controle. O publico continua calculado pelos cards da allowlist. Rotinas ja executadas pelo backend, como `Chegada de pedidos`, `Fechamento de caixa` e `Encomenda da Cotacao`, exibem box `Ligado/Desligado`; desligar no painel faz o backend ignorar o disparo mesmo que o cron/worker continue ativo. O card `Fechamento de caixa` tambem tenta mostrar a leitura atual do Financeiro, incluindo se existe caixa aberto nos ultimos 10 dias e quais dias estao pendentes.

Desde 2026-06-06, a resposta WhatsApp de ajuda (`texto sem miauby` ou `miauby n8n`) nao lista todas as rotinas do painel. Ela mostra apenas avisos operacionais que o usuario precisa reconhecer: `Chegada de pedidos`, `Fechamento de caixa` e `Encomenda da Cotacao`, com horario, card e destinatarios por usuario, sem status tecnico de backend. Rotinas internas como smoke pos-deploy, watchdog, Evolution/Baileys, Resumo Pix/OCR, deploy/checks e webhooks tecnicos continuam no painel/log, mas nao entram no menu enviado aos usuarios. O alerta Evolution/Baileys tambem ficou log-only: mesmo se o workflow enviar `notify=problems`, o backend registra a checagem e nao cria outbox/WhatsApp.

## Rotinas iniciais

### Smoke check pos-deploy

Agenda: manual apos deploy ou chamado pelo proprio deploy.

Workflow versionado:

```text
ops/n8n/workflows/miauby-smoke-check-pos-deploy.json
```

O workflow tem disparo manual e webhook ativo `POST /webhook/wimifarma/smoke-check-pos-deploy` no n8n. O payload padrao chama o backend com `notify=always`, para confirmar tambem sucesso quando for acionado apos deploy importante.

Destino: numeros autorizados com card `Miauby`.

Endpoint interno:

```text
POST /miauw/whatsapp/internal/smoke-check
```

Payload sugerido:

```json
{ "notify": "problems" }
```

Use `notify=always` quando quiser uma mensagem de sucesso tambem, por exemplo em deploy importante. O backend roda health do bridge, proxy Apache, core Miauby, Gestao, Pedidos, Cotacao, widget e conexao Evolution. O n8n nao escolhe telefone: o bridge envia apenas para contatos reais com card `Miauby` e ignora LIDs protegidos por alias.

Os checks sao executados em paralelo dentro do bridge para que uma rota lenta nao trave toda a rotina ate a soma dos timeouts. O n8n deve manter timeout proprio um pouco maior que `MIAUW_WHATSAPP_SMOKE_CHECK_TIMEOUT_MS` e chamar com `notify=problems` por padrao.

### Watchdog do WhatsApp

Agenda: a cada poucos minutos, com janela curta.

Workflow versionado:

```text
ops/n8n/workflows/miauby-watchdog-5min.json
```

Agenda: a cada 5 minutos. Desde 2026-06-05, o payload pode continuar mandando `notify=problems`, mas o backend trata o watchdog como log interno e nao envia WhatsApp.

Destino: sem envio por WhatsApp. Os achados ficam em `miauw_whatsapp_automation_runs` para analise posterior.

Endpoint interno:

```text
POST /miauw/whatsapp/internal/watchdog
```

Payload sugerido:

```json
{ "notify": "problems" }
```

O watchdog verifica fila travada, outbox `pending/sending`, falhas recentes, provider pausado, respostas lentas, `sent` sem id do provedor e o caso em que o WhatsApp marcou resposta como enviada mas o mesmo contato mandou nova mensagem e a conversa ficou sem novo `sent`. O resultado e gravado como log interno com severidade, resumo, fingerprint e tipos dos problemas, sem criar outbox nem chamar o provedor. O backend tenta recuperar outbox `pending` recente automaticamente e expira pendencias antigas para evitar envio atrasado demais.

O watchdog considera `next_attempt_at`: itens em backoff normal nao sao tratados como travados antes da hora de retry. Quando o provedor esta pausado por erro temporario, o worker nao fica segurando o processamento; ele devolve o envio para retry/backoff e deixa o watchdog registrar internamente a pausa do transporte.

### Pedidos e boletos

Agenda: todo dia cedo.

Destino: numeros autorizados com card `Pedidos`.

Fluxo:

1. n8n chama endpoint interno de resumo de Pedidos/Gestao.
2. Backend calcula boletos vencendo, pedidos que chegam hoje e pedidos atrasados.
3. Miauby WhatsApp envia resumo curto para destinatarios autorizados.
4. Pagamento ou baixa continua exigindo sistema/core com confirmacao.

### Encomenda da Cotacao as 16h

Agenda: criada pelo app da Cotacao para o dia seguinte as 16:00, timezone `America/Sao_Paulo`.

Destino: se `COTACAO_ENCOMENDA_REMINDER_RECIPIENTS` estiver preenchido, esses numeros viram apenas um filtro de destinatarios; o bridge ainda valida cada numero contra a allowlist real e exige card `Cotacao` liberado. Se vazio, usa todos os contatos autorizados com card `Cotacao`.

Endpoint interno chamado pela Cotacao:

```text
POST /miauw/whatsapp/internal/cotacao-encomenda-reminder
```

Fluxo:

1. A Cotacao detecta `encomenda` em uma linha salva e grava `cotacao_v2_encomenda_reminders`; importacao Google Sheets e restore de backup tambem reconciliam os lembretes depois da substituicao em massa.
2. O lembrete fica previsto para o dia seguinte as 16h, com produto, quantidade, texto original, status e destinatarios mascarados/modo.
3. Antes do envio, a Cotacao confere a linha de novo; se `encomenda` sumiu ou a linha foi removida, cancela o lembrete.
4. O Miauby Whats confere se a rotina `cotacao_encomenda_16h` esta ativa no painel.
5. A mensagem e curta e interna, perguntando se a encomenda chegou, com criada em, hoje e contexto do produto/quantidade.
6. O envio nao altera valor, fornecedor, ganhador, status ou linha da Cotacao.
7. O aviso deve sair uma unica vez por `cotacao_v2_encomenda_reminders.id`: a Cotacao espera ate `COTACAO_ENCOMENDA_REMINDER_WHATSAPP_TIMEOUT_MS` pelo bridge e o Miauby Whats bloqueia reenvio por `reminder_id` ja enviado, mesmo se uma tentativa anterior tiver estourado timeout na Cotacao.

Como conferir sem enviar mensagem:

1. Abrir `/miauw/whatsapp/`, secao `n8n automacoes`, card `Encomenda da Cotacao`.
2. Ver `Status agora`: worker da Cotacao, ultima varredura, vencidos agora, proximo pendente, ultima tentativa e ultimo erro.
3. Se precisar conferir direto no backend, chamar `GET /cotacao/api/internal/encomenda-reminders/status` com token interno. Esse endpoint e somente leitura e nao dispara WhatsApp.
4. Se `vencidos agora` estiver `0`, o worker nao vai chamar o bridge naquele momento. Se houver vencidos e `ultima tentativa` nao mudar, investigar container/logs da Cotacao.

Auditoria de 2026-06-02:

- n8n em producao estava ativo com workflows de smoke, watchdog, Evolution/Baileys, Pix/OCR, Pedidos e Financeiro; nao havia workflow n8n dedicado para Cotacao, o que esta correto para o fluxo atual.
- O painel/backend do Miauby Whats tinha `cotacao_encomenda_16h` cadastrado e ligado em `miauw_whatsapp_automation_settings`.
- A Cotacao tinha 2 lembretes pendentes em `cotacao_v2_encomenda_reminders`, ambos previstos para 2026-06-03 16h America/Sao_Paulo, ainda sem execucao no bridge porque nao tinham vencido.
- `miauw_whatsapp_automation_runs` e `miauw_whatsapp_error_logs` nao tinham registros de Cotacao no momento da auditoria; isso e esperado ate a primeira execucao real ou dry-run dessa rotina.
- O painel do Miauby Whats passou a ler o status real da fila da Cotacao para evitar confundir `Ligado no backend` com prova de que havia lembrete vencido.
- Nao mover autosave, precos, fornecedores, quantidades ou import/restore para n8n. Para Cotacao, n8n deve ficar restrito a smoke, watchdog, alerta de backend parado ou monitoramento de cotacao parada.

Auditoria de incidente em 2026-06-03:

- Os 2 lembretes de encomenda previstos para 2026-06-03 16h tiveram tentativas as 16:00 e 16:06 registradas na Cotacao com erro `unauthorized`.
- A causa do `unauthorized` era configuracao: `wimifarma-cotacao-app` nao recebia `MIAUW_WHATSAPP_INTERNAL_TOKEN`, entao caia no `COTACAO_INTERNAL_TOKEN`, que o endpoint interno do Miauby Whats nao aceita para envio. O Compose passou a entregar `MIAUW_WHATSAPP_INTERNAL_TOKEN` tambem para a Cotacao; `COTACAO_MIAUW_WHATSAPP_INTERNAL_TOKEN` continua podendo sobrescrever quando preenchido.
- Em seguida, as linhas foram limpas por `cells_batch_updated` com usuario `adm`, removendo `produto`, `quantidade` e `categoria` das duas encomendas. Como a palavra `encomenda` saiu da linha, a Cotacao cancelou os lembretes com motivo `Texto de encomenda removido da linha.`
- O sistema nao deve restaurar essas linhas automaticamente: a correcao segura e manter o token certo para proximos avisos e usar o historico da celula/linha para recuperacao manual quando uma encomenda for limpa sem querer.

Auditoria de incidente em 2026-06-07:

- Um lembrete real de encomenda (`lisdexanfetamina 50`) foi enviado 3 vezes no WhatsApp as 16:00, 16:16 e 16:32.
- A causa foi timeout curto na chamada Cotacao -> Miauby Whats: a Cotacao abortava a requisicao antes do bridge terminar o envio; o bridge enviava a mensagem depois, mas a Cotacao registrava `This operation was aborted` e reagendava.
- O retry de transporte era 15 minutos e o cooldown global do bridge tambem era 15 minutos. Como a mensagem inclui o horario atual (`Hoje`), o fingerprint mudava, e o dedupe por `reminder_id` expirava antes da proxima tentativa.
- A correcao segura aumentou o timeout padrao da chamada para 25 segundos, manteve configuravel por `COTACAO_ENCOMENDA_REMINDER_WHATSAPP_TIMEOUT_MS`, tornou o dedupe por `reminder_id` permanente para essa automacao e faz a Cotacao encerrar como enviado quando o bridge informa duplicata ja enviada. Isso preserva a regra: uma encomenda ativa gera no maximo um aviso.

### Chegada de pedidos as 17h

Agenda: todo dia as 17:00, timezone `America/Sao_Paulo`.

Workflow versionado:

```text
ops/n8n/workflows/pedidos-chegada-17h.json
```

Endpoint interno chamado pelo n8n:

```text
POST /miauw/whatsapp/internal/pedidos-arrival-check
```

Payload:

```json
{ "notify": "always" }
```

Fluxo:

1. n8n dispara o horario e envia o token interno no header `X-Miauw-Internal-Token`.
2. Miauby WhatsApp confere se a rotina `pedidos_chegada_17h` esta ativa no painel.
3. O bridge consulta `GET /pedidos/api/internal/arrival-summary` no app Pedidos.
4. A mensagem vai somente para contatos reais autorizados com card `Pedidos`, em formato de tabela numerada com fornecedor, valor total do pedido, previsao de chegada e data/hora persistida em `pedidos_orders.created_at`.
5. O operador pode responder com o titulo, por exemplo `cimed chegou`, ou `nenhum chegou`; a mensagem automatica nao deve mais incluir essa instrucao no rodape para nao poluir a lista.
6. O bridge valida o card `Pedidos` e chama `POST /pedidos/api/internal/confirm-arrival`.
7. Pedidos move a chegada para `Confirmados` ou `Historico` se ja estava pago; pagamento continua no fluxo normal da tela.

Controle operacional:

- O card `Chegada de pedidos` aparece em `/miauw/whatsapp/` dentro de `n8n automacoes`.
- O botao `Desativar`/`Ativar` muda somente a execucao do backend; o workflow pode continuar agendado no n8n.
- O endpoint aceita `dry_run=true` para validar destinatarios e previa sem enviar WhatsApp.
- A lista prioriza pedidos mais antigos primeiro e mostra a idade aproximada, por exemplo `pedido em 01/06/2026 as 14:30 - ha 2 dias`.

### Financeiro

Agenda: diario e perto do fechamento.

Destino: numeros autorizados com card `Financeiro`.

Alertas:

- fechamento de caixa pendente;
- sangria pendente;
- PIX/maquininha sem conferencia;
- divergencia de total.

O n8n pode lembrar e abrir alerta. Registrar sangria, faturamento ou baixa continua passando por confirmacao/auditoria.

### Fechamento de caixa as 18h

Agenda: todo dia as 18:00, timezone `America/Sao_Paulo`.

Workflow versionado:

```text
ops/n8n/workflows/financeiro-fechamento-caixa-18h.json
```

Endpoint interno chamado pelo n8n:

```text
POST /miauw/whatsapp/internal/financeiro-cash-closing-reminder
```

Payload:

```json
{ "notify": "always" }
```

Fluxo:

1. n8n dispara o horario e envia o token interno no header `X-Miauw-Internal-Token`.
2. Miauby WhatsApp confere se a rotina `financeiro_fechamento_caixa_18h` esta ativa no painel.
3. O bridge consulta `GET /financeiro/api/internal/cash-closing-status` no app Financeiro.
4. O Financeiro devolve o status do dia consultado, `open_days_lookback_days=10` e `open_days`/`open_days_count` com uma lista resumida de dias em `aberto` ou `conferencia` somente entre 10 dias atras e a data consultada; se o dia consultado nao tiver registro, ele aparece como aberto implicito.
5. Se nao houver dia em aberto e o status do dia for `fechado`, `divergente` ou `sem_movimento`, `notify=problems` nao envia mensagem; `notify=always` envia uma confirmacao curta de tudo certo.
6. Se existir caixa aberto/em conferencia/sem registro dentro dessa janela, Miauby envia um bloco curto formatado para contatos reais autorizados com card `Financeiro`: destaca o caixa do dia consultado primeiro, lista um caixa por linha nos ultimos 10 dias e fecha com a acao `Abra o modulo Financeiro e finalize o fechamento do caixa.`. Se todos os caixas estiverem finalizados e a chamada vier com `notify=always`, envia apenas uma confirmacao curta de tudo certo; com `notify=problems`, continua silencioso.

Controle operacional:

- O card `Fechamento de caixa` aparece em `/miauw/whatsapp/` dentro de `n8n automacoes`.
- O botao `Desativar`/`Ativar` muda somente a execucao do backend; o workflow pode continuar agendado no n8n.
- O endpoint aceita `dry_run=true` para validar status, destinatarios, dias em aberto e previa sem enviar WhatsApp.

### Deploy/checks

Agenda: apos deploy ou manual.

Destino: numeros autorizados com card `Miauby`.

Checks:

- `/miauw/whatsapp/health`;
- `/miauw/agent/health`;
- `/gestao/health`;
- `/pedidos/health`;
- `/cotacao/health`;
- rotas principais com HTTP esperado.

Se falhar, n8n envia alerta e pode abrir tarefa de erro. Ele nao faz rollback automatico sem confirmacao humana.

### Evolution/Baileys

Agenda: a cada 30 minutos.

Destino: sem envio por WhatsApp. O resultado fica em `miauw_whatsapp_automation_runs` e no painel interno.

Workflow versionado:

```text
ops/n8n/workflows/evolution-baileys-alerta-30min.json
```

Endpoint interno:

```text
POST /miauw/whatsapp/internal/evolution-baileys-alert
```

Payload:

```json
{ "notify": "problems", "lookback_minutes": 120 }
```

O endpoint verifica, pelo bridge, se a Evolution esta conectada, se o provedor esta pausado e se houve outbox `failed/dead` recente pelo transporte `evolution`. Desde 2026-06-05, ele ignora como falha ativa `dead/stale_pending_expired` e `dead/codex_test_wrong_instance_resolved`, porque representam pendencia expirada segura ou teste/instancia errada ja resolvido. Ele e a versao segura para rotina n8n ativa: nao monta Docker socket, nao executa shell no container do n8n, nao le segredo da Evolution diretamente e nao envia WhatsApp para a equipe.

Para auditoria exata dos timeouts recorrentes do Baileys em `executeInitQueries`/`fetchProps`, o runbook de host continua sendo o script:

```bash
/home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
```

Usar `LOOKBACK=2h` para rotina frequente. O script retorna `0` com `status=ok`, `1` com `status=warn` e `2` com `status=critical`, sem expor API key. Em `warn`, apenas avisar/acompanhar; em `critical`, acionar alerta humano e, se tambem nao houver `MESSAGES_UPSERT`, reiniciar somente o container `wimifarma-evolution-api`.

Nao montar `/var/run/docker.sock` no n8n para rodar esse script sem revisao separada de seguranca. Se for necessario executar o script automaticamente no futuro, preferir SSH/credencial especifica e comando somente leitura.

### Resumo diario Pix/OCR

Agenda: todo dia as 19:10, timezone `America/Sao_Paulo`.

Destino: numeros autorizados com card `Financeiro`, somente quando houver falha/campo faltando por padrao.

Workflow versionado:

```text
ops/n8n/workflows/pix-ocr-resumo-diario-1910.json
```

Endpoint interno:

```text
POST /miauw/whatsapp/internal/pix-ocr-daily-summary
```

Payload:

```json
{ "notify": "problems", "lookback_hours": 24 }
```

O backend le apenas `miauw_whatsapp_events.payload_summary`, `miauw_whatsapp_error_logs` e `miauw_whatsapp_automation_runs` sanitizados do proprio bridge WhatsApp. O resumo mostra tentativas, aceitos, campos faltando, destino divergente, duplicados, descartes rapidos, falhas de OCR e registra a execucao da rotina. Ele nao cria lancamento, nao confirma Pix, nao acessa o banco do Financeiro e nao guarda midia bruta.

Campos opcionais de rastreio, como ID de transacao, E2E e chave Pix do destino, continuam no diagnostico sanitizado quando existirem, mas a falta apenas desses campos nao deve gerar alerta no resumo diario.

### Miauby + n8n

Uso: webhooks controlados para rotinas repetiveis, como:

- `gerar relatorio do dia`;
- `avisar boletos`;
- `abrir tarefa de erro`;
- `rodar smoke check`.

Pelo WhatsApp, o usuario pode pedir `miauby n8n` para ver as automacoes previstas e quais dependem dos cards liberados para aquele numero.

## Tabela resumida das automacoes

Esta tabela serve como cola operacional: o n8n agenda, mas quem decide destinatario, permissao e envio e o backend/Miauby WhatsApp. Para adicionar outro numero a uma rotina existente, o pedido correto e vincular o contato real no painel/Usuarios e liberar o card correspondente; o workflow n8n normalmente nao precisa mudar.

| Automacao | Quando roda | Quem recebe | O que ela faz | O que posso pedir para ajustar | Limite seguro |
| --- | --- | --- | --- | --- | --- |
| Chegada de pedidos | Todo dia as 17h | Contatos reais autorizados com card `Pedidos` | Envia tabela dos pedidos ainda em `Aguardando chegada`, com valor total, previsao e data/hora do pedido | Adicionar/remover numero autorizado, mudar horario, mudar texto, mudar regra de filtro, testar com `dry_run=true` | Nao confirma chegada sozinha; confirmacao vem por resposta validada pelo bridge |
| Fechamento de caixa | Todo dia as 18h | Contatos reais autorizados com card `Financeiro` | Avisa dias de caixa em aberto/conferencia/sem registro nos ultimos 10 dias | Adicionar/remover numero autorizado, mudar horario, mudar janela de dias, mudar texto, pausar/ativar no painel | Nao fecha caixa, nao cria faturamento e nao grava sangria sem fluxo auditado |
| Encomenda da Cotacao | Dia seguinte as 16h, criada pelo app da Cotacao | Contatos reais autorizados com card `Cotacao` | Pergunta se a encomenda marcada na Cotacao chegou, usando lembrete persistido no Postgres da Cotacao | Liberar/remover card `Cotacao`, pausar/ativar rotina no painel, mudar texto ou janela de retry | Nao altera cotacao e nao usa n8n para salvar dados |
| Smoke check pos-deploy | Manual ou apos deploy | Contatos reais autorizados com card `Miauby` | Testa rotas/health principais e avisa problema | Enviar tambem sucesso, adicionar rota de health, mudar cooldown, adicionar numero com card `Miauby` | Nao faz rollback automatico |
| Watchdog WhatsApp | A cada poucos minutos | Sem envio por WhatsApp; fica no painel/log | Vigia fila, outbox, provider pausado e respostas travadas | Ajustar frequencia, janela, severidade e criterios de log | Nao dispara mensagem atrasada fora de contexto; pendencias antigas viram `dead` |
| Evolution/Baileys | A cada 30 min | Sem envio por WhatsApp; fica no painel/log | Registra conexao ruim, provedor pausado ou falha recente de envio Evolution | Ajustar janela, horario/frequencia e criterios de log | Nao executa Docker/shell pelo n8n e nao reinicia Evolution automaticamente |
| Resumo Pix/OCR | Todo dia as 19h10 | Contatos reais autorizados com card `Financeiro` | Resume falhas/campos faltando na leitura Pix por midia | Mudar horario, janela, texto, criterios do resumo ou destinatarios por card `Financeiro` | Nao grava Pix, nao confirma lancamento e nao acessa banco financeiro |
| Pedidos e boletos | Planejada/expansivel | Contatos com card `Pedidos` ou card definido pela rotina | Pode resumir boletos vencendo, pedidos de hoje e atrasos | Criar rotina nova, escolher horario, definir filtros e destinatarios por card | Baixa/pagamento continua exigindo sistema/core com confirmacao |
| Financeiro operacional | Planejada/expansivel | Contatos com card `Financeiro` | Pode lembrar sangria, PIX, maquininha ou divergencia | Criar rotina nova, mudar horario, escolher quais alertas entram | Escrita de dinheiro continua em endpoint interno com confirmacao/auditoria |
| Tarefas com lembrete | Pelo modulo Tarefa, nao por cron n8n atual | Usuario vinculado a tarefa e contato com card `Tarefas` | Envia lembrete agendado da tarefa pelo bridge WhatsApp | Vincular numero ao usuario, liberar card `Tarefas`, alterar horario do lembrete na tarefa | Nao envia para usuario sem vinculo/card e registra tentativa/falha |

Pedidos comuns que sao seguros:

- `adicionar o numero do Thiago para receber chegada de pedidos`: vincular o contato real e liberar card `Pedidos`.
- `esse numero tambem recebe fechamento de caixa`: liberar card `Financeiro` para o contato real.
- `mudar chegada de pedidos para 16h30`: alterar cron do workflow e manter o mesmo endpoint.
- `pausar fechamento de caixa por enquanto`: desativar a rotina no painel do Miauby WhatsApp, sem precisar apagar o workflow.
- `criar alerta novo de boleto vencendo`: criar rotina n8n nova chamando endpoint interno, sem acesso direto ao banco.

Pedidos que exigem cuidado:

- Enviar para grupo de WhatsApp, cliente ou numero sem allowlist: precisa revisao de seguranca.
- Gravar pagamento, sangria, baixa, exclusao ou fechamento direto pelo n8n: nao fazer; precisa backend/Miauby com confirmacao e auditoria.
- Colocar token, URL secreta ou telefone cru no JSON do workflow: nao versionar; usar `.env` e painel/allowlist.

## Quando n8n e melhor que WhatsApp cru

n8n e melhor para tarefas agendadas, integracoes externas, repeticao, retry, branching visual e notificacoes de rotina.

WhatsApp direto via Miauby e melhor para pergunta pontual, comando com contexto humano, confirmacao de acao e consulta rapida.

Regra pratica:

- rotina previsivel e repetida: n8n;
- decisao com risco, dinheiro, baixa, exclusao ou escrita: backend/Miauby com confirmacao;
- conversa simples ou pergunta operacional: Miauby WhatsApp.

## Cuidados

- Nao colocar segredos em workflows exportados.
- Nao dar acesso direto do n8n ao banco de producao para escrita.
- Preferir endpoints internos tokenizados com resposta sanitizada.
- Manter logs com mascara, nunca telefone completo ou payload bruto.
- Testar workflows em modo manual antes de ativar cron.
