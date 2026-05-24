# 08 - Autenticacao e permissoes

## O que esta parte do sistema faz

Controla sessao, login, usuario atual, CSRF e acesso por perfil nos modulos internos. WordPress tem sua propria autenticacao separada.

## Arquivos, rotas e tabelas envolvidos

Arquivos:

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/cashback/auth.php`
- `site/*/login.php`
- `site/*/logout.php`
- `site/*/bootstrap.php`

Rotas:

- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/gestao/login.php`
- `/pedidos/`
- `/xp/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/treino.php`
- `/miauw/diagnostico.php`
- `/wp-login.php`

Tabelas:

- `wf_users`
- `wf_logs`
- `wptl_users`
- `wptl_usermeta`

## Regras que precisam ser preservadas

- Os modulos internos dependem de `current_user()` e helpers compartilhados.
- Formularios sensiveis devem usar CSRF.
- Saida HTML deve usar escape.
- Perfis/roles em `wf_users.role` devem ser respeitados quando a rota exigir permissao.
- WordPress nao deve ser confundido com login dos modulos internos.
- A exclusao de tabelas inteiras em `/codigos/` exige sessao interna ativa, CSRF e senha operacional `wimifarma`; essa senha pode ser alterada por `CODIGOS_GROUP_DELETE_PASSWORD` no `.env`.
- A Gestao (`/gestao/`) usa o servico Node `apps/gestao`, autentica contra `wf_users`, cria sessao propria `WFGESTAO` no Postgres da Gestao e fica restrita a username `adm`, role `admin` ou role `gerente`; lancar conta, adicionar item/juros, registrar pagamento parcial, confirmar saldo, cancelar ou reabrir conta usa CSRF.
- Pedidos (`/pedidos/`) usa o servico Node separado `apps/pedidos`, autentica contra `wf_users`, cria sessao propria `WFPEDIDOS` no Postgres da Gestao e fica restrito a username `adm`, role `admin` ou role `gerente`; criar pedido, confirmar chegada, atualizar vencimento, adicionar juros/valor, registrar parcial e marcar pago usa CSRF.
- Quando uma rota protegida de Pedidos envia o operador para `/pedidos/login.php`, o destino seguro original e preservado na sessao; entrar pelo card `Pedidos` deve voltar para `/pedidos/`, nao para a tela principal de Gestao.
- O endpoint publico `/pedidos/api/badge` retorna somente a contagem de pedidos previstos para chegar hoje, sem detalhes financeiros ou nomes de fornecedores, para alimentar a bolinha do card `Pedidos` na home.
- XP (`/xp/`) reutiliza a sessao interna do PHP e autentica contra `wf_users`; visualizar exige usuario autenticado, enquanto cadastrar funcionario, trocar foto, atualizar foto da moldura ADM, lancar venda, cancelar venda ou excluir/remover usuario/funcionario exige username `adm`, role `admin` ou role `gerente` e CSRF.
- Fotos do XP aceitam somente JPG, PNG ou WEBP validados no servidor, ate 3 MB, com caminho final limitado a `/xp/uploads/funcionarios/` ou `/xp/uploads/adm/`; as pastas precisam estar gravaveis pelo Apache/PHP no VPS.
- O painel `/miauw/diagnostico.php` exige usuario interno autenticado e fica restrito a role `admin`, role `gerente` ou username `adm`; acoes de revisao usam CSRF.
- O painel `/miauw/treino.php` segue a mesma restricao de diagnostico (`admin`, `gerente` ou `adm`); revisar/aprovar/rejeitar treino usa CSRF e nao apaga historico.
- O feedback de chat do Miauby (`api.php?action=train_feedback`) exige sessao interna e CSRF; usuario comum pode sugerir treino, mas exemplo so entra no contexto aprovado depois de revisao humana ou aprovacao rapida de usuario autorizado.
- O audio do Miauby (`api.php?action=audio_transcribe`) exige a mesma sessao interna e CSRF do chat; o browser envia audio temporario para transcricao e nunca recebe chave de API.
- Logins PHP internos usam limitador compartilhado por sessao e por `IP + usuario` em `wf_login_rate_limits`; Cotacao V2 usa bloqueio equivalente em sessao/memoria e regenera a sessao apos login valido.

## Decisoes tecnicas ja tomadas

- Sessao dos modulos internos e configurada em `site/cashback/config.php`.
- Funcoes comuns ficam em `site/cashback/functions.php`.
- Modulos como Cotacao, Financeiro, Tarefas e Miauby reaproveitam o contexto do Cashback.
- O servico sombra `/miauw/agent/run` e `/miauw/agent/stream` nao usa sessao de operador diretamente; ele exige token interno e deve ser chamado pelo PHP/adaptador, nao por usuario final.
- Em Codigos, blocos `EAN 20`, `EAN 40` e `Outros` sao protegidos contra exclusao de tabela inteira pela interface e pela API.

## Riscos ao alterar

- Alterar `current_user()`, sessao ou cookies pode quebrar todos os modulos internos.
- Misturar autenticacao WordPress com autenticacao interna pode criar falhas de permissao.
- Fallbacks legados de acesso precisam ser removidos com cuidado para nao bloquear o usuario sem plano de recuperacao.
- Qualquer senha/chave hardcoded deve ser tratada como divida tecnica e movida para variavel de ambiente ou configuracao segura.

## Pendencias

- Mapear perfis existentes e permissoes por modulo.
- Remover ou substituir fallbacks legados de login.
- Revisar fluxo de desbloqueio de areas sensiveis.
- Criar tela/rotina segura para administracao de usuarios internos.
- Mapear formalmente quais usuarios alem de `admin`/`gerente` devem acessar diagnosticos do Miauby.
- Definir politica de corte para o Miauby agente, usando traces do adaptador PHP e mantendo confirmacao humana antes de qualquer escrita forte.
- Documentar politica de senha e recuperacao de acesso.

## Evolucao futura

- Criar RBAC simples por permissao, nao apenas por role textual.
- Adicionar auditoria central de login/logout/falhas.
- Evoluir o limite de tentativas para painel de monitoramento/alerta, preservando os bloqueios atuais.
- Criar testes automatizados para login, logout, CSRF e acesso negado.
