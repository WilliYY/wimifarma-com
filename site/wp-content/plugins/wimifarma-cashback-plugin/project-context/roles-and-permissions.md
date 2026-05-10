# Roles And Permissions

## Perfis WordPress previstos

### Administrador
Escopo:
- acesso total
- configurações
- relatórios
- logs
- gestão completa do cashback

Capabilities:
- `view_wimifarma_cashback`
- `manage_wimifarma_cashback`
- `manage_wimifarma_cashback_settings`
- `view_wimifarma_cashback_reports`
- `view_wimifarma_cashback_logs`

### Gerente Wimifarma
Escopo:
- operação ampla
- consulta
- relatórios
- configurações
- logs

Capabilities:
- `view_wimifarma_cashback`
- `manage_wimifarma_cashback`
- `manage_wimifarma_cashback_settings`
- `view_wimifarma_cashback_reports`
- `view_wimifarma_cashback_logs`

### Atendente Wimifarma
Escopo:
- cadastro de cliente
- cadastro de compra
- consulta de saldo
- relatórios operacionais

Capabilities:
- `view_wimifarma_cashback`
- `manage_wimifarma_cashback`
- `view_wimifarma_cashback_reports`

Limitações:
- não acessa configurações
- não acessa logs sensíveis por padrão

## Conceito importante
- Usuário WordPress e atendente operacional são entidades diferentes.
- Um atendente pode ser vinculado a um usuário WordPress, mas o vínculo é opcional.
- Isso permite equipe operacional mesmo quando nem todos possuem login.

## Tela por capability
- Dashboard: `view_wimifarma_cashback`
- Clientes: `manage_wimifarma_cashback`
- Compras: `manage_wimifarma_cashback`
- Cashback: `manage_wimifarma_cashback`
- Atendentes: `manage_wimifarma_cashback`
- Relatórios: `view_wimifarma_cashback_reports`
- Configurações: `manage_wimifarma_cashback_settings`
- Logs: `view_wimifarma_cashback_logs`
