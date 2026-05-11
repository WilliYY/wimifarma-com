# 16 - Testes

## O que esta parte do sistema faz

Registra como o projeto e validado hoje e como deve evoluir para testes automatizados.

## Validacao atual

Hoje a validacao e feita com:

- `docker compose ps`
- `php -l` em arquivos PHP importantes
- `curl` em rotas principais
- leitura de logs do container web
- teste visual manual quando ha mudanca de tela

## Arquivos, rotas e componentes envolvidos

Rotas de smoke test:

- `/`
- `/wp-login.php`
- `/cashback/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/widget-status.php`
- `/cotacao/api.php` deve retornar 401 sem sessao

Comandos estao em `docs/05-comandos.md`.

## Regras que precisam ser preservadas

- Rodar validacoes proporcionais ao risco.
- Se mexer em helper comum, testar todos os modulos.
- Se mexer em banco, testar pelo menos login/status e logs.
- Se mexer em front-end, validar visualmente.
- Se mexer em Miauby, validar `widget-status.php`.

## Decisoes tecnicas ja tomadas

- A fase atual prioriza smoke tests por causa da migracao.
- Testes automatizados ainda nao foram estruturados.

## Riscos ao alterar

- Sem testes automatizados, refatoracoes grandes sao arriscadas.
- WordPress lento pode mascarar erro real.
- APIs com sessao podem parecer quebradas quando retornam 401 esperado.

## Pendencias

- Criar script de auditoria local.
- Criar script de auditoria VPS.
- Adicionar testes de API autenticada.
- Adicionar testes de integridade para Cotacao e Financeiro.
- Adicionar teste de seguranca basico para segredos em Git.

## Evolucao futura

- Criar `scripts/audit.ps1`.
- Criar `scripts/audit-vps.sh`.
- Adicionar Playwright ou ferramenta equivalente para fluxos visuais.
- Adicionar testes unitarios para regras de calculo.
