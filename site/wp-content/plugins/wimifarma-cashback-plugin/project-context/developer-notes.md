# Developer Notes

## Decisões técnicas principais
- Plugin-first: a regra de negócio vive no plugin, não no tema.
- Sem build: somente PHP, CSS e JS simples.
- Tabelas próprias para clareza operacional e performance futura.
- Configurações em `wp_options`.
- Logs centralizados em uma tabela única.
- Webhooks outbound para n8n em vez de acoplamento direto com provedor de WhatsApp.
- Retry básico via `WP-Cron` com mesma `reference` para suportar idempotência no n8n.

## Pontos de atenção
- Shared hosting pode atrasar WP-Cron.
- Em produção, prefira cron real na hospedagem chamando `wp-cron.php`.
- Em bases muito grandes, as listagens devem migrar para paginação mais robusta.
- O sistema atualmente usa o valor bruto da compra para gerar cashback.
- O uso do cashback já desconta o saldo antes de gerar o novo crédito da compra.

## Checklist antes de alterar
- revisar `project-context/business-rules.md`
- revisar impacto em `class-cashback.php`
- revisar impacto em `class-purchases.php`
- validar se novo fluxo exige log
- validar se novo fluxo exige webhook
- validar se o cron diário precisa ser ajustado

## Arquivos mais críticos
- `wimifarma-cashback-plugin.php`
- `includes/class-db.php`
- `includes/class-cashback.php`
- `includes/class-purchases.php`
- `includes/class-whatsapp.php`
- `project-context/n8n-webhooks.md`

## Melhor ponto de extensão
- REST API em `includes/class-api.php`
- painel em `/admin`
- templates em `/templates`
- contexto técnico em `/project-context`

## Testes manuais mínimos
1. ativar plugin
2. cadastrar atendente
3. cadastrar cliente
4. registrar compra sem uso de cashback
5. registrar nova compra usando cashback válido
6. tentar uso inválido abaixo da regra 4x
7. configurar webhook e conferir logs
8. validar consulta de saldo no menu Cashback
