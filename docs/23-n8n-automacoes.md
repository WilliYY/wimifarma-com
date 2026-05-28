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

O n8n deve rodar separado do Compose principal, com Postgres proprio, porta publicada apenas em `127.0.0.1:5678` e acesso publico somente por proxy/autenticacao quando estiver pronto.

No Windows deste PC, o n8n tambem foi instalado via npm global para uso local, sem iniciar servico por padrao:

```powershell
n8n --version
```

## Variaveis no Miauby WhatsApp

- `MIAUW_WHATSAPP_N8N_ENABLED=false`
- `MIAUW_WHATSAPP_N8N_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_SECRET`

O painel `/miauw/whatsapp/` mostra se a stack/base e webhook estao configurados e lista as rotinas n8n planejadas com o publico calculado por cards da allowlist.

## Rotinas iniciais

### Pedidos e boletos

Agenda: todo dia cedo.

Destino: numeros autorizados com card `Pedidos`.

Fluxo:

1. n8n chama endpoint interno de resumo de Pedidos/Gestao.
2. Backend calcula boletos vencendo, pedidos que chegam hoje e pedidos atrasados.
3. Miauby WhatsApp envia resumo curto para destinatarios autorizados.
4. Pagamento ou baixa continua exigindo sistema/core com confirmacao.

### Financeiro

Agenda: diario e perto do fechamento.

Destino: numeros autorizados com card `Financeiro`.

Alertas:

- fechamento de caixa pendente;
- sangria pendente;
- PIX/maquininha sem conferencia;
- divergencia de total.

O n8n pode lembrar e abrir alerta. Registrar sangria, faturamento ou baixa continua passando por confirmacao/auditoria.

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
