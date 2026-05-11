# 17 - Performance

## O que esta parte do sistema faz

Documenta riscos e observacoes de performance, principalmente na migracao do WordPress e modulos internos para Docker/VPS.

## Estado observado

- WordPress raiz e `wp-login.php` responderam HTTP 200 localmente.
- No Docker Desktop Windows, WordPress ficou lento com plugins restaurados do HostGator.
- Modulos internos responderam mais rapidamente nos testes de login/status.
- Cache de pagina foi mantido desligado por padrao para evitar comportamento instavel durante a migracao.
- A home publica mostrou HTML com assets `http://wimifarma.com/...` mesmo apos ajustes de HTTPS, indicando cache estatico antigo do SpeedyCache/`advanced-cache.php`.
- Mesmo sem header de SpeedyCache, a home publica ainda podia gerar parte dos assets em `http://`; o tema ganhou uma segunda camada de normalizacao HTTPS.
- A raiz `/` passou a ser servida por `site/home.php`, sem bootstrap do WordPress, para isolar a primeira tela de plugins/cache enquanto a migracao estabiliza.

## Arquivos, rotas e servicos envolvidos

Arquivos:

- `site/wp-config.php`
- `site/.htaccess`
- `site/home.php`
- `site/wp-content/plugins/`
- `site/wp-content/advanced-cache.php`
- `site/wp-content/endurance-page-cache/`
- `site/wp-content/cache/`
- `site/wp-content/speedycache-config/`
- `site/wp-content/themes/wimifarma-cashback-theme/`
- `site/wp-content/themes/wimifarma-cashback-theme/functions.php`
- `site/wp-content/themes/wimifarma-cashback-theme/header.php`
- `site/wp-content/themes/wimifarma-cashback-theme/front-page.php`
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
- Nao ativar page cache publico sem validar que a home gera apenas assets `https://`.
- Nao remover os helpers HTTPS do tema sem substituir por outra camada equivalente.
- Nao remover `site/home.php` ou a regra de raiz no `.htaccess` antes de validar a home WordPress com CSS/JS, HTTPS e cache limpos.
- Nao versionar `site/wp-content/endurance-page-cache/`; ele contem HTML estatico legado do HostGator e pode ressuscitar a home antiga.
- Nao remover plugins sem entender impacto no site.
- Medir antes/depois de mudancas de performance.
- Separar lentidao de Windows Docker da lentidao real no VPS Linux.

## Decisoes tecnicas ja tomadas

- `WP_CACHE` fica `false` por padrao durante migracao.
- Hosts publicos usam `WIMIFARMA_PUBLIC_PAGE_CACHE=false` por padrao e so aceitam page cache quando essa variavel for `true`.
- O tema `wimifarma-cashback-theme` gera assets e links da home por helpers proprios e filtra a saida publica para trocar `http://wimifarma.com` por `https://wimifarma.com`.
- A home publica da raiz usa `site/home.php` com CSS embutido e header `X-Served-By: wimifarma-static-home`; isso reduz dependencia de WordPress, SpeedyCache e ordem de carregamento de plugins na primeira tela.
- `endurance-page-cache.php`, especifico de HostGator, foi removido/quarentenado fora do projeto.
- Investigacao de performance deve comecar por plugins/cache/tema antes de reescrever codigo.

## Riscos ao alterar

- Cache pode esconder bugs de redirect/HTTPS.
- `advanced-cache.php` pode servir HTML antigo antes de `wp-config.php` chegar nos filtros de tema/MU plugin se `WP_CACHE` estiver ligado.
- Buffer de saida no tema pode mascarar fontes antigas de URL; se voltar a aparecer `http://`, procurar tambem plugins que imprimem HTML muito cedo.
- Como `/` nao carrega WordPress enquanto a regra de `home.php` estiver ativa, problemas visuais restantes na primeira tela tendem a ser deploy/proxy/cache do navegador ou edicao fora da pasta correta.
- Se `https://wimifarma.com/home.php` retornar 404, o problema visual publico ainda nao esta no CSS; o arquivo de estabilizacao nao chegou ao servidor publico.
- Plugins premium ignorados pelo Git podem existir no ambiente e afetar comportamento.
- Aumentar recursos sem medir pode mascarar problema de plugin.

## Pendencias

- Medir tempos reais no VPS para `/` e `/wp-login.php`.
- Listar plugins ativos no WordPress.
- Revisar SpeedyCache e plugins vindos do HostGator.
- Decidir quando a home pode voltar para WordPress, se isso ainda for desejado.
- Definir quando e como reativar cache publico com limpeza automatica e validacao de mixed content.
- Criar metrica simples de tempo de resposta pos-deploy.
- Confirmar que caches legados `endurance-page-cache/`, `advanced-cache.php`, `cache/` e `speedycache-config/` nao estao servindo a home antiga no VPS.

## Evolucao futura

- Criar checklist de performance WordPress.
- Ativar cache com regras claras depois de HTTPS.
- Adicionar monitoramento de tempo de resposta.
- Considerar separar tarefas pesadas em jobs.
