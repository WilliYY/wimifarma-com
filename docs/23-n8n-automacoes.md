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

Agenda: a cada 5 minutos, `notify=problems`.

Destino: numeros autorizados com card `Miauby`, somente quando houver problema por padrao.

Endpoint interno:

```text
POST /miauw/whatsapp/internal/watchdog
```

Payload sugerido:

```json
{ "notify": "problems" }
```

O watchdog verifica fila travada, outbox `pending/sending`, falhas recentes, provider pausado, respostas lentas, `sent` sem id do provedor e o caso em que o WhatsApp marcou resposta como enviada mas o mesmo contato mandou nova mensagem e a conversa ficou sem novo `sent`. Alertas usam cooldown por `MIAUW_WHATSAPP_AUTOMATION_NOTIFY_COOLDOWN_MINUTES` para nao floodar. O backend tenta recuperar outbox `pending` recente automaticamente e expira pendencias antigas para evitar envio atrasado demais.

O watchdog considera `next_attempt_at`: itens em backoff normal nao sao tratados como travados antes da hora de retry. Quando o provedor esta pausado por erro temporario, o worker nao fica segurando o processamento; ele devolve o envio para retry/backoff e deixa o watchdog avisar apenas a pausa do transporte.

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

Destino: se `COTACAO_ENCOMENDA_REMINDER_RECIPIENTS` estiver preenchido, usa esses numeros; se vazio, usa contatos autorizados com card `Cotacao`.

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
5. Se nao houver dia em aberto e o status do dia for `fechado`, `divergente` ou `sem_movimento`, nada e enviado.
6. Se existir caixa aberto/em conferencia/sem registro dentro dessa janela, Miauby envia uma frase curta com variacao para contatos reais autorizados com card `Financeiro`, incluindo uma linha como `Caixa em aberto nos ultimos 10 dias para finalizar: 01/06/2026 (Aberto).`

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

Destino: numeros autorizados com card `Miauby`, somente quando houver problema por padrao.

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

O endpoint verifica, pelo bridge, se a Evolution esta conectada, se o provedor esta pausado e se houve outbox `failed/dead` recente pelo transporte `evolution`. Ele e a versao segura para rotina n8n ativa: nao monta Docker socket, nao executa shell no container do n8n e nao le segredo da Evolution diretamente.

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
| Smoke check pos-deploy | Manual ou apos deploy | Contatos reais autorizados com card `Miauby` | Testa rotas/health principais e avisa problema | Enviar tambem sucesso, adicionar rota de health, mudar cooldown, adicionar numero com card `Miauby` | Nao faz rollback automatico |
| Watchdog WhatsApp | A cada poucos minutos | Contatos reais autorizados com card `Miauby`, normalmente so com problema | Vigia fila, outbox, provider pausado e respostas travadas | Ajustar frequencia, cooldown, severidade, destinatarios e texto de alerta | Nao dispara mensagem atrasada fora de contexto; pendencias antigas viram `dead` |
| Evolution/Baileys | A cada 30 min | Contatos reais autorizados com card `Miauby` | Avisa conexao ruim, provedor pausado ou falha recente de envio Evolution | Ajustar janela, horario/frequencia, texto e destinatarios por card `Miauby` | Nao executa Docker/shell pelo n8n e nao reinicia Evolution automaticamente |
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
