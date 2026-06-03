# 08 - Autenticacao e permissoes

## O que esta parte do sistema faz

Controla sessao, login, usuario atual, CSRF e acesso por perfil nos modulos internos. WordPress tem sua propria autenticacao separada.

## Arquivos, rotas e tabelas envolvidos

Arquivos:

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/cashback/auth.php`
- `site/home-sso-lib.php`
- `site/home-sso.php`
- `apps/cashback/src/server.ts`
- `apps/codigos/src/server.ts`
- `apps/usuarios/src/server.ts`
- `site/*/login.php`
- `site/*/logout.php`
- `site/*/bootstrap.php`

Rotas:

- `/`
- `/home-sso.php`
- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/usuarios/login.php`
- `/gestao/login.php`
- `/pedidos/`
- `/xp/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/treino.php`
- `/miauw/diagnostico.php`
- `/miauw/whatsapp/login`
- `/wp-login.php`

Tabelas:

- `wf_users`
- `wf_logs`
- `core_users`
- `core_user_module_permissions`
- `core_user_xp_links`
- `core_user_admin_passwords`
- `core_user_audit_events`
- `usuarios_sessions`
- `cashback_sessions`
- `codigos_sessions`
- `wptl_users`
- `wptl_usermeta`

## Regras que precisam ser preservadas

- Os modulos internos dependem de `current_user()` e helpers compartilhados.
- A home `/` usa sessao `WFHOME` para liberar a tela inicial de cards e, quando existe segredo forte em `WIMIFARMA_HOME_SSO_SECRET` ou `WP_AUTH_KEY`, emite o cookie assinado `WFHOME_SSO` por ate `WIMIFARMA_HOME_SSO_TTL_SECONDS` segundos. Os modulos podem usar esse handoff apenas para criar a propria sessao depois de consultar `core_users` ativo e reaplicar suas restricoes de role/permissao; o cookie da home nao substitui CSRF nem sessao propria. A credencial temporaria padrao solicitada para essa etapa e `adm`/`adm`, com override por `WIMIFARMA_HOME_LOGIN_USER` e `WIMIFARMA_HOME_LOGIN_PASSWORD`.
- Desde 2026-05-31, paginas protegidas e telas antigas de login de Cashback, Cotacao, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro, Usuarios e Miauby redirecionam navegadores sem sessao nem `WFHOME_SSO` para `/`. Health checks, badges publicos e APIs internas tokenizadas mantem suas respostas proprias; APIs autenticadas continuam retornando 401/JSON quando apropriado.
- A navegacao visual dos modulos internos deve oferecer `Home` apontando para `/` e nao deve expor `Sair`; o logout real do operador fica centralizado no botao `Sair` da Home principal. Rotas tecnicas de logout dos modulos podem permanecer por compatibilidade, mas nao devem ser usadas como botao de navegacao.
- Formularios sensiveis devem usar CSRF.
- Saida HTML deve usar escape.
- Perfis/roles em `core_users.role` devem ser respeitados nos modulos cortados para core auth. Em rollback/fallback MySQL onde ainda existir, preservar a mesma regra vindo de `wf_users.role`.
- WordPress nao deve ser confundido com login dos modulos internos.
- Cashback (`/cashback/`) usa o servico Node `apps/cashback`, sessao propria `WFCASHBACK` no Postgres `wimifarma_cashback` e autentica somente contra `core_users`; desde 2026-05-30 nao ha fallback MySQL nem `CASHBACK_AUTH_PROVIDER` no app. Criar cliente, registrar compra, usar cashback, atualizar configuracoes, editar atendentes e marcar WhatsApp usam CSRF. Areas sensiveis como relatorio/exportacao/diagnostico continuam com senha operacional.
- Codigos (`/codigos/`) usa o servico Node `apps/codigos`, sessao propria `WFCODIGOS` no Postgres `wimifarma_codigos` e autentica somente contra `core_users` desde 2026-05-30, sem fallback `wf_users` ou `CODIGOS_AUTH_PROVIDER`. Criar bloco, salvar linha, reordenar, excluir item e excluir tabela usa CSRF. A exclusao de tabelas inteiras exige senha operacional `wimifarma`, alteravel por `CODIGOS_GROUP_DELETE_PASSWORD` no `.env`.
- A Gestao (`/gestao/`) usa o servico Node `apps/gestao`, autentica somente contra `core_users`, cria sessao propria `WFGESTAO` no Postgres da Gestao e fica restrita a username `adm`, role `admin` ou role `gerente`; desde 2026-05-30 nao ha fallback `wf_users` nem variaveis `GESTAO_AUTH_*` no app. Lancar conta, adicionar item/juros, registrar pagamento parcial, confirmar saldo, cancelar ou reabrir conta usa CSRF.
- Pedidos (`/pedidos/`) usa o servico Node separado `apps/pedidos`, autentica somente contra `core_users`, cria sessao propria `WFPEDIDOS` no Postgres da Gestao e fica restrito a username `adm`, role `admin` ou role `gerente`; o app nao possui fallback `wf_users` nem dependencia MySQL em runtime. Criar pedido, confirmar chegada, atualizar vencimento, adicionar juros/valor, registrar parcial e marcar pago usa CSRF.
- Quando uma rota protegida de Pedidos envia o operador para `/pedidos/login.php`, o destino seguro original e preservado na sessao; entrar pelo card `Pedidos` deve voltar para `/pedidos/`, nao para a tela principal de Gestao.
- O endpoint publico `/pedidos/api/badge` retorna somente a contagem total de pedidos ainda em `Aguardando chegada`, sem detalhes financeiros ou nomes de fornecedores, para alimentar a bolinha do card `Pedidos` na home. O campo `arriving_today` continua no JSON apenas como compatibilidade.
- Tarefa (`/tarefa/`) usa o servico Node separado `apps/tarefa`, cria sessao propria `WFTAREFA` no Postgres `wimifarma_tarefa` e permite usuario interno ativo como o modulo PHP antigo. O login usa somente `core_users` desde 2026-05-30, sem fallback `wf_users` ou `TAREFA_AUTH_PROVIDER`; rollback MySQL exige restaurar versao anterior e backup validado. Criar, editar, concluir, cancelar e reabrir tarefa usa CSRF.
- O endpoint publico `/tarefa/badge.php` retorna somente a contagem de tarefas abertas, sem titulo/descricao, para alimentar a bolinha do card `Tarefas` na home.
- XP (`/xp/`) usa o servico Node `apps/xp`, sessao propria `WFXP` no Postgres do XP e autentica somente contra `core_users` desde 2026-05-30, sem fallback `wf_users` ou `XP_AUTH_PROVIDER`. Visualizar exige usuario autenticado, enquanto cadastrar funcionario, trocar foto, atualizar foto da moldura ADM, lancar venda, cancelar venda ou excluir/remover usuario/funcionario exige username `adm`, role `admin` ou role `gerente` e CSRF.
- Fotos do XP aceitam somente JPG, PNG ou WEBP validados no servidor, ate 3 MB, com caminho final limitado a `/xp/uploads/funcionarios/` ou `/xp/uploads/adm/`; as pastas continuam em `site/xp/uploads`, compartilhadas como volume pelo app Node para preservar arquivos e rollback.
- Financeiro (`/financeiro/`) usa o servico Node `apps/financeiro`, sessao propria `WFFINANCEIRO` no Postgres do Financeiro e autentica somente contra `core_users` desde 2026-05-30, sem fallback `wf_users` ou `FINANCEIRO_AUTH_PROVIDER`. Desde 2026-06-02, permissao explicita `core_user_module_permissions.module_key='financeiro'` com `can_access=false` bloqueia login/SSO no modulo, enquanto ausencia de linha preserva compatibilidade legado e `adm` continua como recuperacao segura. Caixa, Relatorio, reabertura, CSV e endpoints internos continuam com CSRF/token conforme o tipo de rota.
- Usuarios (`/usuarios/`) usa o servico Node `apps/usuarios`, sessao propria `WFUSUARIOS` no Postgres core e autentica contra `core_users`. O painel fica restrito a username `adm` ou role `admin`; criar, atualizar, vincular XP, alterar login comum, alterar permissoes e desativar usuario usa CSRF e registra `core_user_audit_events`/`core_audit_logs`. `core_users.display_name` e o nome exibido seguro do operador, separado do login tecnico.
- O login `adm` e o usuario mestre/padrao: nao pode ser excluido, desativado, perder admin nem perder acesso aos modulos pelo painel. Pode trocar nome exibido, senha, vinculo XP e numero de WhatsApp, mantendo `adm` como identificador tecnico.
- O painel Usuarios nao recupera senha antiga importada por hash. Quando o administrador cria ou troca uma senha, inclusive do usuario mestre `adm`, o login continua validando `core_users.password_hash`, mas uma copia cifrada para consulta interna do ADM e gravada em `core_user_admin_passwords`. Se a senha ainda nao foi redefinida no painel, o ADM precisa definir uma nova para passar a saber qual senha esta valida.
- O painel `/miauw/diagnostico.php` exige usuario interno autenticado e fica restrito a role `admin`, role `gerente` ou username `adm`; acoes de revisao usam CSRF.
- O painel `/miauw/treino.php` segue a mesma restricao de diagnostico (`admin`, `gerente` ou `adm`); revisar/aprovar/rejeitar treino usa CSRF e nao apaga historico.
- O feedback de chat do Miauby (`api.php?action=train_feedback`) exige sessao interna e CSRF; usuario comum pode sugerir treino, mas exemplo so entra no contexto aprovado depois de revisao humana ou aprovacao rapida de usuario autorizado.
- O audio do Miauby (`api.php?action=audio_transcribe`) exige a mesma sessao interna e CSRF do chat; o browser envia audio temporario para transcricao e nunca recebe chave de API.
- O painel Miauby WhatsApp (`/miauw/whatsapp/`) usa login proprio por variaveis de ambiente `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` quando preenchidas; a sessao e cookie assinado do servico Node, separado de `wf_users` e do WordPress.
- Login PHP interno do Miauby usa `core_users` e `core_login_rate_limits` no Postgres por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`; rollback MySQL fica opt-in por `WIMIFARMA_INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED=true`. Cashback usa login unico no core no app Node, com limitador persistente em `core_login_rate_limits`. Cotacao V2 usa bloqueio equivalente em sessao/memoria e regenera a sessao apos login valido.
- Na Cotacao V2, importar Google Sheets e restaurar backup sao operacoes fortes: alem de sessao e CSRF, exigem username `adm`, role `admin` ou role `gerente`. Exportar, criar backup, editar celula e restaurar distribuidora apagada seguem as regras existentes.
- Desde 2026-06-03, a Home e os modulos internos tratam `WFHOME_SSO` valido como contexto mais atual do navegador. Ao trocar de operador pela Home, os endpoints e paginas nao devem reaproveitar sessoes antigas de modulos como `WFXP`, `WFUSUARIOS`, `WFCASHBACK`, `WFCOTACAOV2`, `WFCODIGOS`, `WFGESTAO`, `WFPEDIDOS`, `WFTAREFA`, `WFFINANCEIRO` ou `WFWCASHBACK` se o SSO atual apontar outro usuario. O logout da Home expira esses cookies de modulo e limpa chaves frontend do Miauby/Home para evitar fala, XP ou permissao do usuario anterior.
- A Home filtra os cards por `core_user_module_permissions`: `adm`/role `admin` ve tudo; usuario sem linhas explicitas preserva acesso legado; usuario com permissoes salvas ve somente modulos marcados. O mesmo criterio passou a ser reforcado no backend de Cashback, Cotacao, Codigos, XP, Tarefa, Gestao, Pedidos, Financeiro e Miauby, respeitando tambem as restricoes fortes ja existentes de perfil em Gestao/Pedidos/Usuarios.
- O mini-card XP da Home consulta primeiro o endpoint do Usuarios e depois o do XP, ambos em modo `no-store`, apenas quando o modulo `xp` esta liberado para o operador atual. Os dois endpoints revalidam permissao `xp`; a Home so renderiza se o payload pertence ao login atual. Se algum endpoint responder uma sessao antiga de outro usuario, a Home ignora a resposta em vez de mostrar XP incorreto.
- O widget Miauby da Home so carrega quando o modulo `miauw` esta permitido para o operador atual. O Miauby PHP tambem resolve primeiro o SSO atual da Home quando ele existe e bloqueia `miauw` quando a permissao do modulo esta desmarcada, sem alterar motor de chat, ferramentas, Gemini ou historico.

## Decisoes tecnicas ja tomadas

- Sessao dos modulos internos PHP e configurada em `site/cashback/config.php`.
- Funcoes comuns legadas ficam em `site/cashback/functions.php`; `internal_authenticate_user()` e `current_user()` consultam o core Postgres por padrao quando um modulo PHP remanescente usa esse caminho.
- Cashback, Tarefa, Cotacao, Gestao, Pedidos, XP, Codigos, Financeiro e Usuarios usam sessoes Node proprias por rota. Quando recebem `WFHOME_SSO`, consultam `/home-sso.php`, buscam o usuario no `core_users` e regeneram a sessao do modulo antes de liberar a rota. Se ja existir sessao propria de outro usuario, o SSO atual vence. Miauby PHP tambem aceita o handoff da home, mas continua no caminho PHP ate seu corte. Sem sessao propria nem SSO valido, o navegador deve voltar para a home `/`, nao para formularios locais de login.
- O servico sombra `/miauw/agent/run` e `/miauw/agent/stream` nao usa sessao de operador diretamente; ele exige token interno e deve ser chamado pelo PHP/adaptador, nao por usuario final.
- Em Codigos, blocos `EAN 20`, `EAN 40` e `Outros` sao protegidos contra exclusao de tabela inteira pela interface e pela API.

## Riscos ao alterar

- Alterar `current_user()`, sessao ou cookies pode quebrar todos os modulos internos.
- Enfraquecer `WIMIFARMA_HOME_SSO_SECRET`/`WP_AUTH_KEY` pode permitir forja do handoff; valores fracos ou padroes devem deixar o SSO inativo e manter login manual.
- Misturar autenticacao WordPress com autenticacao interna pode criar falhas de permissao.
- Fallbacks legados de acesso precisam ser removidos com cuidado para nao bloquear o usuario sem plano de recuperacao.
- Qualquer senha/chave hardcoded deve ser tratada como divida tecnica e movida para variavel de ambiente ou configuracao segura.

## Pendencias

- Mapear perfis existentes e permissoes por modulo.
- Manter fallbacks MySQL de login apenas como rollback opt-in e retirar codigo legado quando houver janela segura.
- Revisar fluxo de desbloqueio de areas sensiveis.
- Aplicar `core_user_module_permissions` nos modulos existentes em etapas, com rollback e teste por modulo, para evitar bloquear a equipe sem plano de recuperacao.
- Mapear formalmente quais usuarios alem de `admin`/`gerente` devem acessar diagnosticos do Miauby.
- Definir politica de corte para o Miauby agente, usando traces do adaptador PHP e mantendo confirmacao humana antes de qualquer escrita forte.
- Documentar politica de senha e recuperacao de acesso.

## Evolucao futura

- Evoluir o RBAC central criado em `/usuarios/` para enforcement nos modulos existentes, mantendo linhas ausentes como compatibilidade legado ate o corte de cada rota.
- Adicionar auditoria central de login/logout/falhas.
- Evoluir o limite de tentativas para painel de monitoramento/alerta, preservando os bloqueios atuais.
- Criar testes automatizados para login, logout, CSRF e acesso negado.
