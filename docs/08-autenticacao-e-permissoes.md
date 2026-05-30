# 08 - Autenticacao e permissoes

## O que esta parte do sistema faz

Controla sessao, login, usuario atual, CSRF e acesso por perfil nos modulos internos. WordPress tem sua propria autenticacao separada.

## Arquivos, rotas e tabelas envolvidos

Arquivos:

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/cashback/auth.php`
- `apps/cashback/src/server.ts`
- `apps/codigos/src/server.ts`
- `apps/usuarios/src/server.ts`
- `site/*/login.php`
- `site/*/logout.php`
- `site/*/bootstrap.php`

Rotas:

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
- `core_user_audit_events`
- `usuarios_sessions`
- `cashback_sessions`
- `codigos_sessions`
- `wptl_users`
- `wptl_usermeta`

## Regras que precisam ser preservadas

- Os modulos internos dependem de `current_user()` e helpers compartilhados.
- Formularios sensiveis devem usar CSRF.
- Saida HTML deve usar escape.
- Perfis/roles em `core_users.role` devem ser respeitados quando a rota usa `*_AUTH_PROVIDER=core`; em rollback/fallback MySQL, preservar a mesma regra vindo de `wf_users.role`.
- WordPress nao deve ser confundido com login dos modulos internos.
- Cashback (`/cashback/`) usa o servico Node `apps/cashback`, sessao propria `WFCASHBACK` no Postgres `wimifarma_cashback` e autentica oficialmente contra `core_users` quando `CASHBACK_AUTH_PROVIDER=core`; rollback e voltar `CASHBACK_AUTH_PROVIDER=mysql`. Criar cliente, registrar compra, usar cashback, atualizar configuracoes, editar atendentes e marcar WhatsApp usam CSRF. Areas sensiveis como relatorio/exportacao/diagnostico continuam com senha operacional.
- Codigos (`/codigos/`) usa o servico Node `apps/codigos`, sessao propria `WFCODIGOS` no Postgres `wimifarma_codigos` e autentica oficialmente contra `core_users` quando `CODIGOS_AUTH_PROVIDER=core`; rollback e voltar `CODIGOS_AUTH_PROVIDER=mysql`. Criar bloco, salvar linha, reordenar, excluir item e excluir tabela usa CSRF. A exclusao de tabelas inteiras exige senha operacional `wimifarma`, alteravel por `CODIGOS_GROUP_DELETE_PASSWORD` no `.env`.
- A Gestao (`/gestao/`) usa o servico Node `apps/gestao`, autentica oficialmente contra `core_users` por `GESTAO_AUTH_PROVIDER=core`, cria sessao propria `WFGESTAO` no Postgres da Gestao e fica restrita a username `adm`, role `admin` ou role `gerente`; `wf_users` fica desligado por padrao e so volta como rollback opt-in quando `GESTAO_AUTH_MYSQL_FALLBACK_ENABLED=true`. Lancar conta, adicionar item/juros, registrar pagamento parcial, confirmar saldo, cancelar ou reabrir conta usa CSRF.
- Pedidos (`/pedidos/`) usa o servico Node separado `apps/pedidos`, autentica somente contra `core_users`, cria sessao propria `WFPEDIDOS` no Postgres da Gestao e fica restrito a username `adm`, role `admin` ou role `gerente`; o app nao possui fallback `wf_users` nem dependencia MySQL em runtime. Criar pedido, confirmar chegada, atualizar vencimento, adicionar juros/valor, registrar parcial e marcar pago usa CSRF.
- Quando uma rota protegida de Pedidos envia o operador para `/pedidos/login.php`, o destino seguro original e preservado na sessao; entrar pelo card `Pedidos` deve voltar para `/pedidos/`, nao para a tela principal de Gestao.
- O endpoint publico `/pedidos/api/badge` retorna somente a contagem total de pedidos ainda em `Aguardando chegada`, sem detalhes financeiros ou nomes de fornecedores, para alimentar a bolinha do card `Pedidos` na home. O campo `arriving_today` continua no JSON apenas como compatibilidade.
- Tarefa (`/tarefa/`) usa o servico Node separado `apps/tarefa`, cria sessao propria `WFTAREFA` no Postgres `wimifarma_tarefa` e permite usuario interno ativo como o modulo PHP antigo. O login oficial usa `core_users` com `TAREFA_AUTH_PROVIDER=core` por padrao; rollback e voltar `TAREFA_AUTH_PROVIDER=mysql`. Criar, editar, concluir, cancelar e reabrir tarefa usa CSRF.
- O endpoint publico `/tarefa/badge.php` retorna somente a contagem de tarefas abertas, sem titulo/descricao, para alimentar a bolinha do card `Tarefas` na home.
- XP (`/xp/`) usa o servico Node `apps/xp`, sessao propria `WFXP` no Postgres do XP e autentica oficialmente contra `core_users` quando `XP_AUTH_PROVIDER=core`; rollback e voltar `XP_AUTH_PROVIDER=mysql`. Visualizar exige usuario autenticado, enquanto cadastrar funcionario, trocar foto, atualizar foto da moldura ADM, lancar venda, cancelar venda ou excluir/remover usuario/funcionario exige username `adm`, role `admin` ou role `gerente` e CSRF.
- Fotos do XP aceitam somente JPG, PNG ou WEBP validados no servidor, ate 3 MB, com caminho final limitado a `/xp/uploads/funcionarios/` ou `/xp/uploads/adm/`; as pastas continuam em `site/xp/uploads`, compartilhadas como volume pelo app Node para preservar arquivos e rollback.
- Usuarios (`/usuarios/`) usa o servico Node `apps/usuarios`, sessao propria `WFUSUARIOS` no Postgres core e autentica contra `core_users`. O painel fica restrito a username `adm` ou role `admin`; criar, atualizar, vincular XP, alterar permissoes e desativar usuario usa CSRF e registra `core_user_audit_events`/`core_audit_logs`.
- O painel `/miauw/diagnostico.php` exige usuario interno autenticado e fica restrito a role `admin`, role `gerente` ou username `adm`; acoes de revisao usam CSRF.
- O painel `/miauw/treino.php` segue a mesma restricao de diagnostico (`admin`, `gerente` ou `adm`); revisar/aprovar/rejeitar treino usa CSRF e nao apaga historico.
- O feedback de chat do Miauby (`api.php?action=train_feedback`) exige sessao interna e CSRF; usuario comum pode sugerir treino, mas exemplo so entra no contexto aprovado depois de revisao humana ou aprovacao rapida de usuario autorizado.
- O audio do Miauby (`api.php?action=audio_transcribe`) exige a mesma sessao interna e CSRF do chat; o browser envia audio temporario para transcricao e nunca recebe chave de API.
- O painel Miauby WhatsApp (`/miauw/whatsapp/`) usa login proprio por variaveis de ambiente `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` quando preenchidas; a sessao e cookie assinado do servico Node, separado de `wf_users` e do WordPress.
- Login PHP interno do Miauby usa `core_users` e `core_login_rate_limits` no Postgres por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`; rollback MySQL fica opt-in por `WIMIFARMA_INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED=true`. Cashback agora usa `CASHBACK_AUTH_PROVIDER=core` no app Node, com limitador persistente em `core_login_rate_limits`. Cotacao V2 usa bloqueio equivalente em sessao/memoria e regenera a sessao apos login valido.

## Decisoes tecnicas ja tomadas

- Sessao dos modulos internos PHP e configurada em `site/cashback/config.php`.
- Funcoes comuns legadas ficam em `site/cashback/functions.php`; `internal_authenticate_user()` e `current_user()` consultam o core Postgres por padrao quando um modulo PHP remanescente usa esse caminho.
- Cashback, Tarefa, Cotacao, Gestao, Pedidos, XP, Codigos, Financeiro e Usuarios usam sessoes Node proprias por rota. Miauby PHP continua no caminho PHP ate seu corte.
- O servico sombra `/miauw/agent/run` e `/miauw/agent/stream` nao usa sessao de operador diretamente; ele exige token interno e deve ser chamado pelo PHP/adaptador, nao por usuario final.
- Em Codigos, blocos `EAN 20`, `EAN 40` e `Outros` sao protegidos contra exclusao de tabela inteira pela interface e pela API.

## Riscos ao alterar

- Alterar `current_user()`, sessao ou cookies pode quebrar todos os modulos internos.
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
