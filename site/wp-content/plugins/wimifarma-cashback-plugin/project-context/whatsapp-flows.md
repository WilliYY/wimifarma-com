# WhatsApp Flows

## Observação importante
As mensagens abaixo são referências de operação.
O disparo real é feito via webhook para n8n.

## Fluxo 1: após compra
Objetivo:
- confirmar a compra
- informar o cashback gerado
- reforçar validade

Mensagem sugerida:
`Obrigado pela compra, {client_name}. Você recebeu {cashback_generated} de cashback e ele expira em {expires_at}.`

Dados úteis:
- `client_name`
- `client_phone`
- `purchase_amount`
- `cashback_generated`
- `expires_at`
- `attendant_name`

## Fluxo 2: alerta de expiração
Objetivo:
- avisar que o crédito está perto do vencimento
- incentivar retorno

Mensagem sugerida:
`Olá, {client_name}. Seu cashback de {expiring_amount} expira em {expires_at}.`

Dados úteis:
- `client_name`
- `client_phone`
- `expiring_amount`
- `expires_at`
- `days_to_expire`

## Fluxo 3: aniversário
Objetivo:
- relacionamento
- reativação
- humanização da marca

Mensagem sugerida:
`Feliz aniversário, {client_name}. A equipe Wimifarma deseja um dia especial para você.`

Dados úteis:
- `client_name`
- `client_phone`
- `birth_date`

## Recomendações de n8n
- validar telefone antes do envio
- centralizar templates em um nó de composição
- registrar resposta do provedor
- permitir fallback em caso de falha do gateway
- usar tags por tipo de evento

## Ideias futuras
- campanhas de reativação para clientes sem compra há X dias
- mensagens de saldo alto perto do vencimento
- segmentação por atendente ou unidade
