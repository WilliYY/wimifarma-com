# 16 - Testes

## O que esta parte do sistema faz

Registra como o projeto e validado hoje e como deve evoluir para testes automatizados.

## Validacao atual

Hoje a validacao e feita com:

- `docker compose ps`
- `php -l` em arquivos PHP importantes
- `site/miauw/miauw-evals.php` para intents, guardrails e registry do Miauby
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
- `/miauw/diagnostico.php` deve exigir sessao e perfil autorizado
- `/miauw/widget-status.php`
- `/cotacao/health` deve responder JSON 200 pela Cotacao V2
- `/cotacao/api/bootstrap` deve exigir sessao e redirecionar/recusar quando nao autenticado

Comandos estao em `docs/05-comandos.md`.

## Miauby - evals locais

O Miauby possui um runner CLI de avaliacoes locais em `site/miauw/miauw-evals.php`.

Ele valida:

- status e versao publica do agente;
- guardrails contra bastidores tecnicos, prompt, stack trace, fornecedor e chaves `sk-...`;
- sanitizacao de codigo/caminhos internos;
- redirect de assuntos tecnicos para suporte tecnico interno;
- registry essencial de skills;
- rotas de modelo `fast`, `smart` e `boss`;
- intents de lancamento financeiro, tarefa, encomenda e urgente de Cotacao.

Rodar pelo container:

```powershell
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
```

O runner nao chama OpenAI e nao executa escritas reais nos modulos.

## Regras que precisam ser preservadas

- Rodar validacoes proporcionais ao risco.
- Se mexer em helper comum, testar todos os modulos.
- Se mexer em banco, testar pelo menos login/status e logs.
- Se mexer em front-end, validar visualmente.
- Se mexer em Miauby, validar `widget-status.php` e `miauw-evals.php`.
- Se mexer no painel de diagnostico do Miauby, validar login local e acesso a `/miauw/diagnostico.php`.

## Decisoes tecnicas ja tomadas

- A fase atual prioriza smoke tests por causa da migracao.
- O Miauby possui primeira camada automatizada de evals locais para intents e respostas proibidas.
- Os evals tambem validam o payload seguro do painel de diagnostico da Fase 3.

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
- Ampliar evals do Miauby para cotacao rapida, alertas, memoria e tools OpenAI registradas.

## Evolucao futura

- Criar `scripts/audit.ps1`.
- Criar `scripts/audit-vps.sh`.
- Adicionar Playwright ou ferramenta equivalente para fluxos visuais.
- Adicionar testes unitarios para regras de calculo.
