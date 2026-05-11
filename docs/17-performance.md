# 17 - Performance

## O que esta parte do sistema faz

Documenta riscos e observacoes de performance, principalmente na migracao do WordPress e modulos internos para Docker/VPS.

## Estado observado

- WordPress raiz e `wp-login.php` responderam HTTP 200 localmente.
- No Docker Desktop Windows, WordPress ficou lento com plugins restaurados do HostGator.
- Modulos internos responderam mais rapidamente nos testes de login/status.
- Cache foi mantido desligado em localhost para evitar comportamento instavel durante a migracao.

## Arquivos, rotas e servicos envolvidos

Arquivos:

- `site/wp-config.php`
- `site/wp-content/plugins/`
- `site/wp-content/themes/wimifarma-cashback-theme/`
- `docker/php/Dockerfile`
- `docker-compose.yml`

Rotas:

- `/`
- `/wp-login.php`
- rotas dos modulos internos

Servicos:

- `wimifarma-com-web`
- `wimifarma-com-db`

## Regras que precisam ser preservadas

- Nao ativar cache agressivo antes de corrigir URL publica e SSL.
- Nao remover plugins sem entender impacto no site.
- Medir antes/depois de mudancas de performance.
- Separar lentidao de Windows Docker da lentidao real no VPS Linux.

## Decisoes tecnicas ja tomadas

- `WP_CACHE` pode ficar `false` durante migracao.
- `endurance-page-cache.php`, especifico de HostGator, foi removido/quarentenado fora do projeto.
- Investigacao de performance deve comecar por plugins/cache/tema antes de reescrever codigo.

## Riscos ao alterar

- Cache pode esconder bugs de redirect/HTTPS.
- Plugins premium ignorados pelo Git podem existir no ambiente e afetar comportamento.
- Aumentar recursos sem medir pode mascarar problema de plugin.

## Pendencias

- Medir tempos reais no VPS para `/` e `/wp-login.php`.
- Listar plugins ativos no WordPress.
- Revisar SpeedyCache e plugins vindos do HostGator.
- Criar metrica simples de tempo de resposta pos-deploy.

## Evolucao futura

- Criar checklist de performance WordPress.
- Ativar cache com regras claras depois de HTTPS.
- Adicionar monitoramento de tempo de resposta.
- Considerar separar tarefas pesadas em jobs.
