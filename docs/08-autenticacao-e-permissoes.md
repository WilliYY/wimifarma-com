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
- `/tarefa/login.php`
- `/miauw/login.php`
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

## Decisoes tecnicas ja tomadas

- Sessao dos modulos internos e configurada em `site/cashback/config.php`.
- Funcoes comuns ficam em `site/cashback/functions.php`.
- Modulos como Cotacao, Financeiro, Tarefas e Miauby reaproveitam o contexto do Cashback.

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
- Documentar politica de senha e recuperacao de acesso.

## Evolucao futura

- Criar RBAC simples por permissao, nao apenas por role textual.
- Adicionar auditoria central de login/logout/falhas.
- Adicionar limite de tentativas consistente em todos os modulos.
- Criar testes automatizados para login, logout, CSRF e acesso negado.
