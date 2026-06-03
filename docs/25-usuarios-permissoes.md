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

- `core_users`: logins internos. Usuarios novos criados pelo painel usam `source='usuarios:core'` e `legacy_mysql_id` negativo para nao conflitar com ids positivos importados de `wf_users`. O campo `display_name` guarda o nome exibido do operador sem trocar o login tecnico.
- `source='mysql:wf_users'` e `legacy_mysql_id` sao somente origem historica/reconciliacao de usuarios antigos migrados para o Postgres; a interface deve mostrar esse estado como migrado, sem sugerir uso ativo de MySQL no modulo Usuarios.
- `core_user_module_permissions`: permissao por modulo e usuario.
- `core_user_xp_links`: vinculo logico entre usuario e funcionario em `xp_employees`.
- `core_user_admin_passwords`: cofre administrativo das senhas definidas pelo painel Usuarios. Guarda senha cifrada com AES-GCM para consulta do ADM; o login continua usando somente `core_users.password_hash`.
- `core_user_whatsapp_links`: vinculo seguro entre usuario e contatos da allowlist do Miauby WhatsApp. Guarda `contact_id`, mascara, nome, status e cards liberados; o numero completo permanece somente cifrado no bridge WhatsApp.
- `core_user_vacations`: periodo de ferias por usuario, com data de inicio, data de retorno, status operacional, usuario que alterou e marcas de aviso de inicio/retorno enviados pelo Miauby Whats.
- `core_user_vacation_events`: historico de cadastro, alteracao, limpeza e processamento das ferias.
- `core_user_vacation_message_logs`: log central de mensagens automaticas bloqueadas por ferias e avisos de ferias/retorno enviados ou com falha.
- `core_user_audit_events`: historico de criacao, atualizacao, desativacao, permissoes, vinculo XP e acoes relevantes do painel.
- `core_audit_logs`: espelho curto para auditoria compartilhada dos apps Node. A tela de Usuarios usa essa fonte central para mostrar historico geral e por usuario, incluindo eventos operacionais de outros modulos quando eles espelham resumo seguro no core.

## Regras

- Acesso ao painel fica restrito a username `adm` ou role `admin`.
- O campo `Perfil` no painel Usuarios mostra rotulos amigaveis (`Usuario`, `Gerente`, `Administrador`), mas os valores internos continuam `user`, `gerente` e `admin` em `core_users.role`. Esse campo nao e apenas cosmetico: altera permissao base em modulos que respeitam role. O usuario mestre `adm` continua com perfil bloqueado para nao perder acesso administrativo.
- A Home principal (`site/home.php`) autentica primeiro em `core_users` ativo, usando `username_normalized` em minusculo e `password_hash` bcrypt. Assim `thiago`, `Thiago` e `THIAGO` entram no mesmo login canonico; `WIMIFARMA_HOME_LOGIN_USER`/`WIMIFARMA_HOME_LOGIN_PASSWORD` permanece apenas como fallback operacional.
- O painel Usuarios permite editar o login de usuarios comuns, atualizando `core_users.username` e `username_normalized` juntos, com normalizacao segura e bloqueio de duplicidade sem diferenciar maiuscula/minuscula. O login tecnico `adm` continua fixo e nao pode ser trocado pelo painel.
- Criar/atualizar/desativar usuario exige CSRF.
- Senhas antigas importadas por hash continuam irrecuperaveis. A partir do painel Usuarios, sempre que o ADM cria ou troca uma senha, `core_users.password_hash` recebe o bcrypt oficial do login e `core_user_admin_passwords` recebe uma copia cifrada para consulta interna no bloco `Senha ADM`.
- Senha simples/curta e permitida no cadastro e na troca feita pelo ADM. O painel pode avisar visualmente que a senha e fraca, mas nao bloqueia; a seguranca obrigatoria continua sendo hash `bcrypt` para login e cofre ADM cifrado. Nunca salvar senha em texto puro.
- Se nao existir registro no cofre administrativo, o painel deve orientar o ADM a definir uma nova senha. Nao tentar quebrar hash antigo.
- A chave do cofre usa `USUARIOS_PASSWORD_VAULT_KEY`; se ela nao estiver definida, o app usa `USUARIOS_SESSION_SECRET`. Trocar essa chave sem redefinir as senhas torna os registros antigos do cofre indisponiveis, mas nao altera o login por hash.
- Excluir usuario no painel significa `active=false`; nao apagar fisicamente.
- O usuario `adm` nao pode ser desativado.
- O usuario `adm` e o usuario mestre/padrao da farmacia. O login tecnico `adm` deve continuar fixo para recuperacao, permissoes internas e cortes seguros do Miauby; pelo painel, ele pode trocar nome exibido, senha, vinculo XP e WhatsApp, mas nao pode ser excluido, desativado, perder role/admin nem ficar sem acesso aos modulos.
- Deve existir pelo menos um administrador ativo.
- O vinculo com XP nao copia vendas nem pontos; referencia `xp_employees.id` e guarda o nome exibido em `core_user_xp_links.xp_employee_name` para leitura rapida. Desde 2026-06-03, o nome fica sincronizado nos dois sentidos: salvar nome exibido/vinculo em Usuarios atualiza o funcionario XP vinculado, e editar o nome do funcionario/perfil ADM no XP atualiza o snapshot e o `display_name` dos usuarios vinculados.
- A home consulta `/usuarios/api/me/xp-card` e `/xp/api/me/xp-card` para mostrar o mini-card XP do usuario logado quando houver vinculo e o modulo `xp` estiver permitido. Esses endpoints aceitam sessao propria do modulo ou o handoff seguro `WFHOME_SSO`, sempre revalidando o usuario ativo no core e a permissao do modulo XP antes de devolver dados. Os totais continuam vindo de `xp_sales`, entao lancamentos de XP aparecem na home sem copiar pontuacao para o core.
- A criacao de tarefa privada pelo painel chama `POST /tarefa/api/internal/tasks/private` com token interno. A tarefa fica em `tarefa_tasks.assigned_core_user_id`; somente esse login enxerga, edita, conclui, cancela ou reabre a tarefa no modulo Tarefa. Tarefas comuns continuam sem dono e aparecem para todos. O app Tarefa revalida o usuario de destino antes de gravar, entao o painel Usuarios nao e a unica barreira contra tarefa orfa ou dono sem acesso.
- O bloco `Tarefa privada` do painel Usuarios deve espelhar a criacao do modulo Tarefa: prioridade `Alta`/`Normal`/`Baixa`, titulo e descricao. A tarefa sempre nasce `aberta`, privada para o usuario escolhido, e o fluxo de editar/concluir/cancelar continua no modulo `/tarefa/`.
- Tarefas privadas nao sao espelhadas em `wf_tarefas`, para nao vazar tarefa individual no legado MySQL.
- O vinculo de WhatsApp pelo painel chama endpoints internos do bridge: `POST /miauw/whatsapp/internal/allowlist/link-user`, `POST /miauw/whatsapp/internal/allowlist/update-user-display-name` e `POST /miauw/whatsapp/internal/allowlist/unlink-user`. O modulo Usuarios nao grava telefone cru; recebe apenas `contact_id`, mascara, nome, status e cards. Quando o operador nao informa `Nome no Miauby`, o painel usa `core_users.display_name` e, se ele estiver vazio, o login tecnico. Se o nome exibido do usuario muda e ja existe WhatsApp vinculado, o painel sincroniza o novo nome no bridge para que o Miauby Whats registre acoes com o responsavel correto.
- Um usuario pode ter mais de um numero vinculado. Um numero deve ter um unico usuario dono operacional; quando o mesmo contato e vinculado a outro usuario, o painel remove o vinculo seguro antigo do core.
- O bloco `Ferias` do card de usuario grava inicio e retorno em `core_user_vacations`. O status exibido e derivado por `America/Sao_Paulo`: sem ferias, ferias agendadas, em ferias ou retornou. A data de retorno representa o primeiro dia de volta, entao o bloqueio de mensagens automaticas vale enquanto `inicio <= hoje < retorno`.
- Limpar ferias remove apenas o periodo ativo em `core_user_vacations`; o historico fica preservado em `core_user_vacation_events` e `core_audit_logs`.
- Ferias nao removem allowlist, nao bloqueiam login e nao alteram permissao. Elas apenas sinalizam ao Miauby Whats para nao entregar mensagens automaticas ao usuario enquanto estiver em ferias.
- Durante ferias, o Miauby Whats bloqueia lembretes automaticos e rotinas por card para contatos vinculados ao usuario, registra `core_user_vacation_message_logs`/`core_audit_logs` e nao fica tentando reenviar infinitamente. Mensagens manuais, login e acoes do ADM continuam fora desse bloqueio.
- No primeiro dia de ferias e no dia do retorno, o Miauby Whats pode enviar uma saudacao curta para os numeros vinculados ao usuario. As marcas `vacation_message_sent_at` e `return_message_sent_at` evitam duplicidade; quando nao ha contato vinculado, o bridge registra evento de ausencia de destinatario uma vez no dia.
- Para acoes do Miauby, o responsavel operacional e resolvido por prioridade: sessao logada do Miauby interno, vinculo do WhatsApp/allowlist, responsavel manual e, por ultimo, responsavel nao identificado. O nome exibido vem de `core_users.display_name` na sessao ou do nome seguro do vinculo (`display_name`) no WhatsApp; se faltar nome separado, o login operacional e convertido para leitura humana, como `sueli` -> `Sueli` e `joao.silva` -> `Joao Silva`.
- Em acoes financeiras pelo Miauby, sessao logada ou WhatsApp vinculado vencem o responsavel digitado para evitar que um usuario registre sangria/PIX como outra pessoa sem permissao. O responsavel manual fica apenas como fallback quando nao ha usuario identificado.
- Em comandos de Tarefas pelo Miauby interno, o responsavel vem sempre da sessao logada. Usuario comum cria tarefa privada para si por padrao, lista/consulta apenas tarefas publicas e privadas visiveis para o proprio `core_users.id`, e nao pode criar tarefa geral nem direcionar tarefa para outro usuario. ADM/admin pode criar tarefa para outro usuario ou tarefa geral, ve todas quando pede a lista, e pode consultar/concluir/cancelar tarefas por comando apos escolha segura e confirmacao humana quando altera status. Datas simples no comando (`amanha 15h`, `sexta cedo`, `dd/mm`) viram lembrete apenas quando a tarefa tem usuario privado.
- Em comandos de Tarefas pelo Miauby WhatsApp, o responsavel vem do numero vinculado na allowlist. O contato precisa ter card `Tarefas`, estar autorizado e vinculado a `core_users`; o app Tarefa revalida `actor_user_id` e permissao antes de criar, listar, consultar, concluir ou cancelar. Usuario comum nao pode cancelar tarefa criada/delegada por ADM; se a busca por texto encontrar varias tarefas, o Miauby lista opcoes por grupo/usuario, guarda uma pendencia curta vinculada ao numero e aceita numero, ordinal, grupo (`a geral`, `adm 1`, `minha 2`), usuario ou trecho do titulo antes de consultar ou pedir o SIM/NAO final. Pendencias expiradas exigem repetir o comando para evitar acao errada.
- Remover o WhatsApp no painel bloqueia o contato salvo no bridge e remove o vinculo seguro do core. LIDs protegidos por alias de ambiente continuam bloqueados para edicao/remocao operacional.
- Linhas ausentes em `core_user_module_permissions` preservam acesso legado ate cada modulo ser cortado para enforcement.
- Desde 2026-06-03, a Home principal usa `core_user_module_permissions` para decidir quais cards aparecem para o usuario logado. `adm`/role `admin` ve todos os cards; usuarios sem linhas explicitas seguem em compatibilidade legado; usuarios com permissoes salvas veem apenas os modulos marcados no painel Usuarios.
- No logout da Home, as sessoes dos modulos tambem sao expiradas no navegador (`WFXP`, `WFUSUARIOS`, `WFCASHBACK`, `WFCOTACAOV2`, `WFCODIGOS`, `WFGESTAO`, `WFPEDIDOS`, `WFTAREFA`, `WFFINANCEIRO`, `WFWCASHBACK`) e chaves frontend da Home/Miauby sao limpas. Isso evita que, apos sair de Thiago e entrar como ADM, a Home reaproveite XP, fala ou contexto antigo.
- O mini-card XP da Home deve sempre pertencer ao login atual da Home e so aparece quando o card/modulo `xp` esta liberado. A Home consulta `/usuarios/api/me/xp-card` e `/xp/api/me/xp-card` com `no-store`; os endpoints bloqueiam usuario sem permissao `xp` e a Home descarta qualquer payload cujo `user.username` nao combine com o login atual.
- O widget Miauby na Home so carrega quando o modulo `miauw` esta liberado para o usuario atual. Se `miauw` estiver desmarcado, o card e o widget nao aparecem, e a API PHP do Miauby tambem bloqueia a sessao.
- O backend agora reforca permissao por modulo nos acessos diretos dos modulos ja cortados para core auth: Cashback, Cotacao, Codigos, XP, Tarefa, Gestao, Pedidos, Financeiro e Miauby. A regra de compatibilidade continua: ausencia total de linhas permite legado; quando ha linhas salvas, modulo ausente/desmarcado nao deve abrir por URL direta.
- A grade de modulos do painel deve manter os nomes legiveis sem quebrar palavras dentro dos chips; `Salvar` fica separado visualmente de `Excluir` para evitar clique confuso.
- Desde 2026-06-03, o card expandido de usuario usa layout frontend em blocos responsivos: cabecalho com contagem separada, badges abaixo do nome, conta/senha/XP em grid proprio, cofre ADM e status compactos, modulos densos e integracoes ajustadas por largura. As integracoes `Ferias`, `Tarefa privada` e `WhatsApp do funcionario` usam areas responsivas: por padrao, Ferias/Tarefa ficam lado a lado e WhatsApp ganha linha inteira para nao esmagar campos e cards; em telas muito largas voltam a caber em tres colunas. Essa regra e apenas visual; nao altera nomes de campos, CSRF, permissao, hash de senha, cofre ADM, ferias, tarefa privada, WhatsApp ou endpoints.
- Desde 2026-06-03, cada card tambem mostra um resumo de acesso para ADM/admin: nome exibido, login canonico, senha ADM mascarada vinda do cofre cifrado quando existir, status, perfil, quantidade de WhatsApp e modulos liberados. O resumo nunca mostra hash; `Mostrar`/`Copiar` usa a mesma senha descriptografada do cofre administrativo ja restrito ao painel Usuarios.
- Clicar no corpo/cabecalho do card de usuario alterna a edicao automaticamente: fechado abre, aberto fecha/minimiza. O script precisa ignorar cliques em `Editar`, `Historico`, botoes, links, campos, labels, formularios e integracoes para preservar as acoes normais.
- No card lateral `Novo usuario`, o controle de senha deve caber dentro do card: campo em linha propria e botoes `Gerar`, `Mostrar` e `Copiar` na linha seguinte, sem vazar sobre a lista de usuarios.
- O historico geral e o historico por usuario devem ficar recolhidos por padrao para evitar poluir a tela; abrir `Historico` no card deve mostrar os eventos recentes daquele login automaticamente, inclusive quando um novo colaborador for criado. Eventos operacionais de outros modulos aparecem quando o modulo grava `core_audit_logs.actor_user_id` com o `core_users.id` do responsavel.
- As telas de login e painel devem declarar favicon proprio (`/cashback/favicon.png`) para nao herdar o fallback do WordPress.

## Integracoes internas

- `USUARIOS_TAREFA_INTERNAL_BASE_URL`: base interna do app Tarefa, por padrao `http://wimifarma-tarefa-app:3500/tarefa`.
- `USUARIOS_TAREFA_INTERNAL_TOKEN`: token para criar tarefa privada; pode reaproveitar `TAREFA_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`.
- `USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL`: base interna do bridge WhatsApp, por padrao `http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp`.
- `USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN`: token para gerenciar allowlist por usuario; pode reaproveitar `MIAUW_WHATSAPP_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN` ou `MIAUW_AGENT_INTERNAL_TOKEN`.
- Para comandos de Tarefas vindos do Miauby WhatsApp, o container do bridge tambem precisa receber `MIAUW_WHATSAPP_TAREFA_INTERNAL_TOKEN` ou `TAREFA_INTERNAL_TOKEN`; caso contrario o contato pode estar correto na allowlist, mas a consulta a `/tarefa/api/internal/tasks/visible` retorna `401 unauthorized`.
- `USUARIOS_INTERNAL_HTTP_TIMEOUT_MS`: timeout curto das chamadas internas, default `4500`.
- `USUARIOS_PASSWORD_VAULT_KEY`: chave operacional para cifrar o cofre administrativo de senhas definidas pelo painel. Deve ficar somente no `.env`/ambiente do VPS.

## Validacao de ferias

1. Abrir `/usuarios/`, editar um usuario com WhatsApp vinculado e preencher `Ferias` com inicio/retorno.
2. Conferir se o card mostra `Ferias agendadas`, `Em ferias` ou `Retornou` conforme a data de Sao Paulo.
3. Rodar no Miauby Whats um dry-run seguro do endpoint interno:

```bash
curl -fsS -X POST https://wimifarma.com/miauw/whatsapp/internal/vacation-check \
  -H "Authorization: Bearer $MIAUW_WHATSAPP_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true}'
```

4. Durante ferias, disparos automaticos devem registrar bloqueio em `core_user_vacation_message_logs` e aparecer no historico do usuario, sem remover a allowlist.

## Ordem de implantacao

1. Subir `/usuarios/` com schema, painel, health e auditoria.
2. Validar login admin, criacao/desativacao, permissao por modulo e vinculo XP.
3. Aplicar enforcement por modulo em etapas pequenas, com rollback por modulo.
4. Atualizar a home/perfis para mostrar dados do XP do usuario quando o vinculo estiver confiavel e o modulo `xp` estiver liberado. A home mostra o mini-card via `WFHOME_SSO` valido ou sessoes ativas de XP/Usuarios.
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
