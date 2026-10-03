# Ponte restrita de alertas comerciais

O servico `wimifarma-miauw-whatsapp` recebe avisos do Wimifarma BR sem compartilhar o token interno amplo do legado. A ponte permanece desligada por padrao e nao altera os comandos, contatos, automacoes ou regras comerciais existentes.

## Configuracao

- `MIAUBY_COMMERCE_ENABLED=false`: ativacao especifica da ponte; o canal `MIAUW_WHATSAPP_ENABLED` tambem precisa estar ativo.
- `MIAUBY_COMMERCE_TOKEN`: segredo exclusivo compartilhado apenas com o backend BR. Nao admite fallback para tokens internos, query string ou webhook.
- `MIAUBY_COMMERCE_RECIPIENT`: um unico numero aprovado, somente digitos, entre 10 e 15 caracteres. Nunca vem do payload.

Criar previamente a rede Docker externa `wimifarma-miauby-bridge-network`, conectando apenas o servico WhatsApp legado e o app BR. O Compose do legado exige essa rede existente. Nao publicar portas adicionais nem adicionar o banco a essa rede. A rota deve ser consumida internamente em `http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp/commerce`.

## Contrato HTTP

Ambos os endpoints exigem `Authorization: Bearer <MIAUBY_COMMERCE_TOKEN>`.

- `GET /miauw/whatsapp/commerce/status`: informa `configured`, `enabled`, `blocked`, `connected` e `recipientHint` mascarado. A conexao Evolution usa a verificacao existente; Meta retorna conexao desconhecida (`null`). Nao retorna segredo, numero, instancia, resposta bruta ou erro do provedor.
- `POST /miauw/whatsapp/commerce/alerts`: aceita somente `{eventId,type,text}`. `eventId` possui 1 a 160 caracteres alfanumericos, `:`, `_` ou `-`; `type` e `cart`, `order`, `payment` ou `test`; `text` possui ate 3000 caracteres e nao aceita controles, exceto tabulacao e quebra de linha.

O BR deve produzir texto minimo, sem nome, telefone, endereco ou dados de pagamento de clientes. O identificador deve ser opaco; a ponte persiste somente identificador, SHA-256 do payload, estado, ID do provedor e timestamps na tabela `miauby_commerce_deliveries`, criada pelo bootstrap existente.

A resposta de envio inclui `ok`, `eventId`, `status`, `messageId`, `accepted`, `delivered:null`, `uncertain`, `duplicate` e `retryable`. `accepted` confirma somente aceitacao com ID do provedor, nunca entrega ao aparelho. Payload invalido retorna 400; mesmo identificador com payload divergente retorna 409; token incorreto retorna 401 e token nao configurado retorna 503.

## Idempotencia e recuperacao

A reserva atomica precede o envio. Repeticoes aceitas retornam o resultado anterior; chamadas concorrentes durante `sending` retornam resultado incerto sem reenviar. Canal desligado, destinatario/transportes ausentes, pausa ou falha de preflight bloqueiam antes da chamada e permitem nova tentativa do mesmo evento.

Depois de invocar o transporte, erro, ID vazio ou timeout de 90 segundos ficam `uncertain`, sem retentativa automatica. Uma reserva `sending` com mais de dois minutos torna-se `uncertain` na proxima consulta do evento. O transporte existente conserva fila, pausas e limites; uma chamada em fila pode terminar depois do timeout. Nao reenviar esse evento: verificar manualmente o provedor antes de decidir qualquer novo aviso. A tabela nao permite excluir historico para contornar deduplicacao.

## Validacao

`npm.cmd run build` e `node --test dist/commerce-bridge.test.js` em `apps/miauw-whatsapp` validam compilacao, token separado, status sanitizado, concorrencia, payload divergente, pausa, ID vazio, erro e timeout. Os testes usam transporte e armazenamento em memoria; nao enviam WhatsApp nem precisam de banco real. A reserva Postgres requer verificacao operacional adicional em ambiente isolado antes da ativacao.
