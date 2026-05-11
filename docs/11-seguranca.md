# 11 - Seguranca

## O que esta parte do sistema faz

Registra cuidados de seguranca ja existentes e riscos encontrados durante a migracao.

## Controles existentes

- `.gitignore` protege `.env`, `mysql/`, backups, dumps, plugins premium e configs locais.
- `.dockerignore` reduz contexto de build.
- `site/cashback/functions.php` envia headers de seguranca em modulos internos.
- CSRF e escape HTML existem nos helpers internos.
- Cookies de sessao usam `HttpOnly` e `SameSite=Lax`.
- HSTS e aplicado somente quando a requisicao e HTTPS.
- Miauby possui rotinas de redacao/evita expor alguns dados sensiveis em diagnosticos.

## Arquivos envolvidos

- `.gitignore`
- `.dockerignore`
- `.env.example`
- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/wp-config.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/config.local.example.php`

## Regras que precisam ser preservadas

- Nunca versionar segredos.
- Nunca publicar MySQL.
- Validar e escapar entrada/saida.
- Usar prepared statements.
- Proteger jobs por token quando forem chamados externamente.
- Revisar permissao antes de expor qualquer endpoint novo.

## Decisoes tecnicas ja tomadas

- Segredos por ambiente/config local.
- Repositorio tratado como publico.
- SSL via Nginx Proxy Manager, nao diretamente no Apache do container.
- `WP_CACHE` e cache publico ficam desligados por padrao durante migracao para evitar HTML antigo, mixed content e comportamento inesperado.

## Riscos ao alterar

- Plugins WordPress herdados podem conter configuracoes antigas.
- Fallbacks legados de autenticacao precisam ser endurecidos.
- Arquivos de upload/cache podem executar codigo se configurados incorretamente.
- Jobs cron sem token forte podem ser abusados.
- Logs podem conter dados internos.

## Pendencias

- Revisar usuarios e senhas internas.
- Remover credenciais/fallbacks legados.
- Criar politica de backup criptografado.
- Revisar permissao de arquivos no VPS.
- Desabilitar ou proteger `xmlrpc.php` se nao for necessario.
- Criar rotina de varredura de segredos antes de push.

## Evolucao futura

- Criar checklist de hardening pos-migracao.
- Criar testes de permissao por rota.
- Adicionar monitoramento de tentativas de login.
- Integrar alertas do Miauby com eventos de seguranca.
