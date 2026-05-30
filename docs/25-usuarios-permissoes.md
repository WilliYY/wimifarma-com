# 25 - Usuarios e permissoes centrais

## Objetivo

Criar uma base central para logins individuais, controle de acesso por modulo, vinculo com XP, delegacao de tarefas privadas, vinculo com WhatsApp do Miauby e historico de mudancas sem separar a experiencia de cada modulo por usuario. As features continuam unicas por modulo; o painel decide quem pode entrar em cada area.

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
- `source='mysql:wf_users'` e `legacy_mysql_id` sao somente origem historica/reconciliacao de usuarios antigos migrados para o Postgres; a interface deve mostrar esse estado como migrado, sem sugerir uso ativo de MySQL no modulo Usuarios.
- `core_user_module_permissions`: permissao por modulo e usuario.
- `core_user_xp_links`: vinculo logico entre usuario e funcionario em `xp_employees`.
- `core_user_whatsapp_links`: vinculo seguro entre usuario e contatos da allowlist do Miauby WhatsApp. Guarda `contact_id`, mascara, nome, status e cards liberados; o numero completo permanece somente cifrado no bridge WhatsApp.
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
- A criacao de tarefa privada pelo painel chama `POST /tarefa/api/internal/tasks/private` com token interno. A tarefa fica em `tarefa_tasks.assigned_core_user_id`; somente esse login enxerga, edita, conclui, cancela ou reabre a tarefa no modulo Tarefa. Tarefas comuns continuam sem dono e aparecem para todos.
- Tarefas privadas nao sao espelhadas em `wf_tarefas`, para nao vazar tarefa individual no legado MySQL.
- O vinculo de WhatsApp pelo painel chama endpoints internos do bridge: `POST /miauw/whatsapp/internal/allowlist/link-user` e `POST /miauw/whatsapp/internal/allowlist/unlink-user`. O modulo Usuarios nao grava telefone cru; recebe apenas `contact_id`, mascara, nome, status e cards.
- Um usuario pode ter mais de um numero vinculado. Um numero deve ter um unico usuario dono operacional; quando o mesmo contato e vinculado a outro usuario, o painel remove o vinculo seguro antigo do core.
- Remover o WhatsApp no painel bloqueia o contato salvo no bridge e remove o vinculo seguro do core. LIDs protegidos por alias de ambiente continuam bloqueados para edicao/remocao operacional.
- Linhas ausentes em `core_user_module_permissions` preservam acesso legado ate cada modulo ser cortado para enforcement.
- A grade de modulos do painel deve manter os nomes legiveis sem quebrar palavras dentro dos chips; `Salvar` fica separado visualmente de `Excluir` para evitar clique confuso.
- As telas de login e painel devem declarar favicon proprio (`/cashback/favicon.png`) para nao herdar o fallback do WordPress.

## Integracoes internas

- `USUARIOS_TAREFA_INTERNAL_BASE_URL`: base interna do app Tarefa, por padrao `http://wimifarma-tarefa-app:3500/tarefa`.
- `USUARIOS_TAREFA_INTERNAL_TOKEN`: token para criar tarefa privada; pode reaproveitar `TAREFA_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`.
- `USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL`: base interna do bridge WhatsApp, por padrao `http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp`.
- `USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN`: token para gerenciar allowlist por usuario; pode reaproveitar `MIAUW_WHATSAPP_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN` ou `MIAUW_AGENT_INTERNAL_TOKEN`.
- `USUARIOS_INTERNAL_HTTP_TIMEOUT_MS`: timeout curto das chamadas internas, default `4500`.

## Ordem de implantacao

1. Subir `/usuarios/` com schema, painel, health e auditoria.
2. Validar login admin, criacao/desativacao, permissao por modulo e vinculo XP.
3. Aplicar enforcement por modulo em etapas pequenas, com rollback por modulo.
4. Atualizar a home/perfis para mostrar dados do XP do usuario quando o vinculo estiver confiavel. A primeira entrega mostra o mini-card na home para sessoes ativas de XP/Usuarios.
5. Delegar tarefas individuais pelo painel Usuarios, mantendo tarefa normal publica no modulo Tarefa.
6. Vincular numeros do Miauby WhatsApp por usuario para avisos individuais sem copiar telefone cru para o core.

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
