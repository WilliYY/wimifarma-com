# 25 - Usuarios e permissoes centrais

## Objetivo

Criar uma base central para logins individuais, controle de acesso por modulo, vinculo com XP e historico de mudancas sem separar a experiencia de cada modulo por usuario. As features continuam unicas por modulo; o painel decide quem pode entrar em cada area.

## Stack

- App: `apps/usuarios`
- Rota: `/usuarios/`
- Container: `wimifarma-usuarios-app`
- Porta interna: `3900`
- Runtime: Node.js 22 + TypeScript + Express
- Banco: Postgres core `wimifarma_core`
- Sessao: `WFUSUARIOS` em `usuarios_sessions`

## Tabelas

- `core_users`: logins internos. Usuarios novos criados pelo painel usam `source='usuarios:core'` e `legacy_mysql_id` negativo para nao conflitar com ids positivos importados de `wf_users`.
- `core_user_module_permissions`: permissao por modulo e usuario.
- `core_user_xp_links`: vinculo logico entre usuario e funcionario em `xp_employees`.
- `core_user_audit_events`: historico de criacao, atualizacao, desativacao, permissoes e vinculo XP.
- `core_audit_logs`: espelho curto para auditoria compartilhada dos apps Node.

## Regras

- Acesso ao painel fica restrito a username `adm` ou role `admin`.
- Criar/atualizar/desativar usuario exige CSRF.
- Excluir usuario no painel significa `active=false`; nao apagar fisicamente.
- O usuario `adm` nao pode ser desativado.
- Deve existir pelo menos um administrador ativo.
- O vinculo com XP nao copia vendas nem pontos; apenas referencia `xp_employees.id` e guarda o nome como snapshot.
- A home consulta `/usuarios/api/me/xp-card` e `/xp/api/me/xp-card` para mostrar o mini-card XP do usuario logado quando houver vinculo. Os totais continuam vindo de `xp_sales`, entao lancamentos de XP aparecem na home sem copiar pontuacao para o core.
- Linhas ausentes em `core_user_module_permissions` preservam acesso legado ate cada modulo ser cortado para enforcement.

## Ordem de implantacao

1. Subir `/usuarios/` com schema, painel, health e auditoria.
2. Validar login admin, criacao/desativacao, permissao por modulo e vinculo XP.
3. Aplicar enforcement por modulo em etapas pequenas, com rollback por modulo.
4. Atualizar a home/perfis para mostrar dados do XP do usuario quando o vinculo estiver confiavel. A primeira entrega mostra o mini-card na home para sessoes ativas de XP/Usuarios.
5. Evoluir tarefas individuais usando o vinculo usuario/permissao como base.

## Validacao

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\usuarios
npm.cmd run check
npm.cmd run build
curl.exe -sS http://127.0.0.1:3002/usuarios/health
```

No VPS, validar tambem:

```bash
docker compose ps wimifarma-usuarios-app wimifarma-com-web
docker compose logs --tail=80 wimifarma-usuarios-app
curl -fsS https://wimifarma.com/usuarios/health
```
