# Data Model

## Visão geral
O plugin usa tabelas próprias com prefixo `{$wpdb->prefix}wfwc_`.

## attendants
Tabela operacional de equipe.

Campos:
- `id` bigint unsigned PK
- `wp_user_id` bigint unsigned nullable
- `full_name` varchar(191)
- `status` varchar(20)
- `notes` text nullable
- `created_at` datetime
- `updated_at` datetime
- `created_by_user` bigint unsigned nullable

Índices:
- `status`
- `wp_user_id`
- `full_name`

## clients
Cadastro de clientes.

Campos:
- `id` bigint unsigned PK
- `full_name` varchar(191)
- `phone` varchar(30) nullable
- `birth_date` date nullable
- `notes` text nullable
- `status` varchar(20)
- `attendant_id` bigint unsigned nullable
- `created_at` datetime
- `updated_at` datetime
- `created_by_user` bigint unsigned nullable

Índices:
- `phone`
- `full_name`
- `status`
- `attendant_id`

## purchases
Registro de compras e resultado financeiro do cashback.

Campos:
- `id` bigint unsigned PK
- `client_id` bigint unsigned
- `attendant_id` bigint unsigned nullable
- `gross_amount` decimal(12,2)
- `cashback_generated` decimal(12,2)
- `cashback_used` decimal(12,2)
- `net_amount` decimal(12,2)
- `purchase_date` datetime
- `notes` text nullable
- `webhook_status` varchar(20)
- `created_at` datetime
- `created_by_user` bigint unsigned nullable

Índices:
- `client_id`
- `attendant_id`
- `purchase_date`

## cashback_credits
Créditos gerados por compra.

Campos:
- `id` bigint unsigned PK
- `purchase_id` bigint unsigned
- `client_id` bigint unsigned
- `original_amount` decimal(12,2)
- `available_amount` decimal(12,2)
- `used_amount` decimal(12,2)
- `expired_amount` decimal(12,2)
- `status` varchar(20)
- `expires_at` datetime
- `created_at` datetime
- `updated_at` datetime

Status esperados:
- `active`
- `partial`
- `used`
- `expired`

Índices:
- `client_id`
- `purchase_id`
- `status`
- `expires_at`

## cashback_usages
Rastreio do consumo de cashback por crédito.

Campos:
- `id` bigint unsigned PK
- `purchase_id` bigint unsigned
- `client_id` bigint unsigned
- `credit_id` bigint unsigned
- `attendant_id` bigint unsigned nullable
- `amount_used` decimal(12,2)
- `purchase_amount` decimal(12,2)
- `used_at` datetime
- `notes` text nullable
- `created_by_user` bigint unsigned nullable

Índices:
- `client_id`
- `purchase_id`
- `credit_id`
- `used_at`

## logs
Tabela única de logs operacionais, automações e segurança.

Campos:
- `id` bigint unsigned PK
- `category` varchar(30)
- `event_type` varchar(60)
- `related_type` varchar(60) nullable
- `related_id` bigint unsigned nullable
- `reference_key` varchar(191) nullable
- `status` varchar(20)
- `payload` longtext nullable
- `response_code` varchar(20) nullable
- `response_body` longtext nullable
- `created_by_user` bigint unsigned nullable
- `created_at` datetime

Índices:
- `category`
- `event_type`
- `related_type`
- `reference_key`
- `status`
- `created_at`

## Relacionamentos lógicos
- `clients.attendant_id -> attendants.id`
- `purchases.client_id -> clients.id`
- `purchases.attendant_id -> attendants.id`
- `cashback_credits.purchase_id -> purchases.id`
- `cashback_credits.client_id -> clients.id`
- `cashback_usages.purchase_id -> purchases.id`
- `cashback_usages.client_id -> clients.id`
- `cashback_usages.credit_id -> cashback_credits.id`

## Decisões de modelagem
- Configurações do sistema ficam em `wp_options` na chave `wfwc_settings`.
- O modelo separa crédito gerado de uso consumido para permitir rastreabilidade fina.
- `logs.reference_key` evita duplicidade de disparos automáticos.
