# 23 - n8n Automacoes

## Objetivo

O n8n deve ser uma camada de automacao e orquestracao externa. Ele nao deve virar fonte de verdade, nao deve gravar dados diretamente nas tabelas de negocio e nao deve substituir as permissoes do Miauby/Apps. Destinatarios devem ser calculados pelos cards dos contatos reais autorizados; LIDs da Evolution mapeados por alias ficam ocultos/protegidos e nao devem receber automacoes diretamente.

Regra de arquitetura:

```text
n8n agenda/webhook -> endpoint interno tokenizado -> backend Wimifarma -> auditoria/confirmacao -> WhatsApp
```

## Stack sugerida

Template versionado:

- `ops/n8n/docker-compose.yml`
- `ops/n8n/.env.example`
- `ops/n8n/workflows/pedidos-chegada-17h.json`
- `ops/n8n/workflows/financeiro-fechamento-caixa-18h.json`

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
docker compose exec -T wimifarma-n8n n8n update:workflow --id=pedidos-chegada-17h --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=financeiro-fechamento-caixa-18h --active=true
docker compose restart wimifarma-n8n
```

Os workflows possuem ID estavel para importacao idempotente. Em n8n 2.22 no modo simples, a importacao por CLI desativa o workflow e a ativacao precisa ser aplicada depois pelo comando `update:workflow`/`publish:workflow`, seguida de restart para o agendador carregar o cron.

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

O painel `/miauw/whatsapp/` mostra se a stack/base e webhook estao configurados, resume o fluxo seguro `n8n agenda -> backend valida -> WhatsApp avisa` e lista as rotinas n8n planejadas em cards com Quando, Card, Destino, o que o n8n chama, o que o Miauby envia/faz, exemplo do estilo da mensagem, Limite e Controle. O publico continua calculado pelos cards da allowlist. Rotinas ja executadas pelo backend, como `Chegada de pedidos` e `Fechamento de caixa`, exibem box `Ligado/Desligado`; desligar no painel faz o backend ignorar o disparo mesmo que o cron do n8n continue ativo.

## Rotinas iniciais

### Smoke check pos-deploy

Agenda: manual apos deploy ou chamado pelo proprio deploy.

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
4. A mensagem vai somente para contatos reais autorizados com card `Pedidos`.
5. O operador responde com o titulo, por exemplo `cimed chegou`, ou `nenhum chegou`.
6. O bridge valida o card `Pedidos` e chama `POST /pedidos/api/internal/confirm-arrival`.
7. Pedidos move a chegada para `Confirmados` ou `Historico` se ja estava pago; pagamento continua no fluxo normal da tela.

Controle operacional:

- O card `Chegada de pedidos` aparece em `/miauw/whatsapp/` dentro de `n8n automacoes`.
- O botao `Desativar`/`Ativar` muda somente a execucao do backend; o workflow pode continuar agendado no n8n.
- O endpoint aceita `dry_run=true` para validar destinatarios e previa sem enviar WhatsApp.

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
4. Se o status do dia for `fechado`, `divergente` ou `sem_movimento`, nada e enviado.
5. Se o caixa estiver aberto/em conferencia/sem registro, Miauby envia uma frase curta com variacao para contatos reais autorizados com card `Financeiro`.

Controle operacional:

- O card `Fechamento de caixa` aparece em `/miauw/whatsapp/` dentro de `n8n automacoes`.
- O botao `Desativar`/`Ativar` muda somente a execucao do backend; o workflow pode continuar agendado no n8n.
- O endpoint aceita `dry_run=true` para validar status, destinatarios e previa sem enviar WhatsApp.

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

Para monitorar os timeouts recorrentes do Baileys em `executeInitQueries`/`fetchProps`, o n8n pode executar por SSH/Execute Command no host do VPS o script:

```bash
/home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
```

Usar `LOOKBACK=2h` para rotina frequente. O script retorna `0` com `status=ok`, `1` com `status=warn` e `2` com `status=critical`, sem expor API key. Em `warn`, apenas avisar/acompanhar; em `critical`, acionar alerta humano e, se tambem nao houver `MESSAGES_UPSERT`, reiniciar somente o container `wimifarma-evolution-api`.

### Miauby + n8n

Uso: webhooks controlados para rotinas repetiveis, como:

- `gerar relatorio do dia`;
- `avisar boletos`;
- `abrir tarefa de erro`;
- `rodar smoke check`.

Pelo WhatsApp, o usuario pode pedir `miauby n8n` para ver as automacoes previstas e quais dependem dos cards liberados para aquele numero.

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
