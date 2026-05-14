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
- A home standalone usa video de fundo em tela inteira e tres GIFs animados; manter o movimento leve e reaproveitar o padrao dos logins.

## Cotacao V2 - baseline de performance em 2026-05-14

Ambiente medido: Docker local em Windows, rota `http://127.0.0.1:3002/cotacao/`, usuario interno `adm`, Cotacao V2 com 20 linhas ativas, 12 colunas visiveis, 66 eventos, 0 regras e 0 estilos manuais no momento da medicao.

Tempos HTTP locais observados:

- `/cotacao/`: 20 ms, 13,7 KB de HTML.
- `/cotacao/api/bootstrap`: primeira chamada autenticada 401 ms; chamadas seguintes entre 23 ms e 99 ms, 6,6 KB.
- `/cotacao/api/diagnostics`: primeira chamada 242 ms; chamadas seguintes entre 26 ms e 123 ms, 2,3 KB.
- `/cotacao/app.js`: 58 ms, 89,2 KB.
- `/cotacao/styles.css`: 26 ms, 22,8 KB.
- `/cotacao/socket.io/socket.io.js`: 64 ms, 155,8 KB.
- `/miauw/widget.js`: 36 ms, 36,6 KB.
- `/miauw/widget-status.php`: variou entre 29 ms e 367 ms em repeticoes locais; uma chamada fria observada chegou a 1,55 s.

Consumo local em repouso/baixa atividade:

- `wimifarma-cotacao-app`: cerca de 32 MB a 37 MB de RAM, CPU proxima de 0%.
- `wimifarma-cotacao-db`: cerca de 22 MB a 31 MB de RAM, CPU proxima de 0%.
- `wimifarma-cotacao-redis`: cerca de 4 MB a 5 MB de RAM.
- `wimifarma-com-web`: cerca de 19 MB a 26 MB de RAM.

Banco Postgres no momento da medicao:

- `cotacao_v2_rows`: 22 linhas totais, 20 ativas, cerca de 80 KB.
- `cotacao_v2_columns`: 14 colunas totais, 12 visiveis, cerca de 48 KB.
- `cotacao_v2_events`: 66 eventos, cerca de 104 KB.
- `cotacao_v2_styles`: 0 registros, cerca de 48 KB alocados.
- `cotacao_v2_rules`: 0 registros, cerca de 32 KB alocados.

Consultas principais do snapshot ainda estao baratas com esse volume: leitura de linhas, colunas e ultimo evento ficou abaixo de 1 ms de execucao no Postgres local. O planejamento da consulta apareceu entre 37 ms e 49 ms no `EXPLAIN ANALYZE`, comum no primeiro planejamento local e nao necessariamente gargalo no volume atual.

Pontos de crescimento identificados:

- O frontend contem 33 chamadas a `renderTable()`, portanto muitas acoes ainda podem reconstruir a grade inteira.
- O frontend contem 15 referencias a `reloadSheet()`, e esse caminho usa `/api/bootstrap`, que recarrega o snapshot inteiro.
- O backend contem 24 chamadas a `loadSheet()`, inclusive em rotas de mutacao simples; isso carrega colunas, linhas, regras, estilos e ultimo evento mesmo quando a acao precisa de pouco contexto.
- A tela mantem `reloadSheet()` periodico a cada 60 segundos quando visivel. Hoje e leve, mas cresce com linhas, colunas, regras e estilos.
- O widget do Miauby pode contribuir para percepcao de lag dentro da Cotacao porque `widget-status.php` faz bootstrap do Miauby, leitura de mensagens, alertas e varredura leve do guardian.

Conclusao da Etapa 0:

- A Cotacao V2 nao esta pesada no volume local atual.
- O risco principal e escalabilidade linear do snapshot completo e da renderizacao completa da grade.
- A proxima etapa segura deve adicionar sync por eventos/delta mantendo `/api/bootstrap` como fallback, e depois substituir recarregamentos periodicos por busca incremental.
- Antes de otimizar visualmente, remover `loadSheet()` de mutacoes simples e medir as rotas no VPS real.

## Cotacao V2 - Etapa 1 de seguranca em 2026-05-14

A Etapa 1 preparou a base sem mudar o comportamento da planilha para a equipe:

- `/cotacao/api/bootstrap` continua sendo o fallback oficial e confiavel para recarregar o snapshot completo.
- Nenhuma tabela, linha, coluna, estilo, regra ou evento foi removido.
- O schema ganhou apenas indices aditivos para as consultas atuais de snapshot:
  - `cotacao_v2_quotes_status_created_idx`;
  - `cotacao_v2_columns_visible_quote_position_idx`;
  - `cotacao_v2_rows_active_quote_position_idx`;
  - `cotacao_v2_rules_quote_priority_idx`;
  - `cotacao_v2_styles_quote_updated_idx`.
- `/cotacao/api/diagnostics` passou a devolver um bloco `safety`, confirmando a etapa atual, que o fallback por bootstrap segue ativo e que sync incremental ainda nao foi ativado.
- `/cotacao/api/diagnostics` tambem passou a devolver um bloco `performance`, com tempo de `loadSheet()`, tamanho estimado do snapshot e status dos indices esperados.

Essa etapa e propositalmente conservadora: ela prepara observabilidade e indices para crescer a planilha, mas ainda nao troca o fluxo de sincronizacao. A proxima etapa tecnica pode criar `GET /cotacao/api/events?after=` ou rota equivalente, mantendo bootstrap completo como recuperacao quando o delta atrasar, falhar ou encontrar divergencia.

## Cotacao V2 - Etapa 2 de delta em 2026-05-14

A Etapa 2 iniciou a troca segura de snapshot completo por eventos incrementais:

- Foi criada a rota autenticada `GET /cotacao/api/events?after=<eventId>`.
- A rota usa cursor por `id` do evento, apoiada no indice existente `cotacao_v2_events_quote_id_idx`.
- O frontend passou a usar delta no refresh automatico de 60 segundos, no retorno da aba para visivel e no reconnect do Socket.IO.
- `/cotacao/api/bootstrap` continua como fallback: se o cursor for invalido, houver eventos demais, ou aparecer evento estrutural como import/restore/coluna, a tela recarrega o snapshot completo.
- O delta aplica diretamente eventos simples de celulas, lotes de celulas, linhas, estilos e regras condicionais.
- Eventos estruturais seguem conservadores e forcam snapshot completo para nao arriscar divergencia de colunas, ordem ou restore.

Esse e um passo real na direcao de uma experiencia estilo Google Sheets: a tela deixa de depender de recarregar tudo para perceber mudancas pequenas, mas ainda conserva uma recuperacao segura quando o evento exige contexto completo.

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
- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `docker/php/Dockerfile`
- `docker-compose.yml`

Rotas:

- `/`
- `/wp-login.php`
- rotas dos modulos internos
- `/cotacao/`
- `/cotacao/api/bootstrap`
- `/cotacao/api/events`
- `/cotacao/api/diagnostics`
- `/cotacao/socket.io/`

Servicos:

- `wimifarma-com-web`
- `wimifarma-com-db`
- `wimifarma-cotacao-app`
- `wimifarma-cotacao-db`
- `wimifarma-cotacao-redis`

## Regras que precisam ser preservadas

- Nao ativar cache agressivo antes de corrigir URL publica e SSL.
- Nao ativar page cache publico sem validar que a home gera apenas assets `https://`.
- Nao remover os helpers HTTPS do tema sem substituir por outra camada equivalente.
- Nao remover `site/home.php` ou a regra de raiz no `.htaccess` antes de validar a home WordPress com CSS/JS, HTTPS e cache limpos.
- Nao versionar `site/wp-content/endurance-page-cache/`; ele contem HTML estatico legado do HostGator e pode ressuscitar a home antiga.
- Nao remover plugins sem entender impacto no site.
- Medir antes/depois de mudancas de performance.
- Separar lentidao de Windows Docker da lentidao real no VPS Linux.
- Manter `/cotacao/api/bootstrap` como fallback confiavel enquanto sync incremental/delta for introduzido.
- Nao otimizar a Cotacao apagando eventos, linhas, estilos ou historico de auditoria.
- Durante a transicao para delta, `/cotacao/api/diagnostics.performance.expectedIndexes` deve mostrar todos os indices esperados com `exists: true` antes de considerar a etapa saudavel.
- Delta incremental nao deve tentar adivinhar mudanca estrutural; quando houver evento de coluna, import ou restore, usar snapshot completo.

## Decisoes tecnicas ja tomadas

- `WP_CACHE` fica `false` por padrao durante migracao.
- Hosts publicos usam `WIMIFARMA_PUBLIC_PAGE_CACHE=false` por padrao e so aceitam page cache quando essa variavel for `true`.
- O tema `wimifarma-cashback-theme` gera assets e links da home por helpers proprios e filtra a saida publica para trocar `http://wimifarma.com` por `https://wimifarma.com`.
- A home publica da raiz usa `site/home.php` com CSS embutido e header `X-Served-By: wimifarma-static-home`; isso reduz dependencia de WordPress, SpeedyCache e ordem de carregamento de plugins na primeira tela.
- `endurance-page-cache.php`, especifico de HostGator, foi removido/quarentenado fora do projeto.
- Investigacao de performance deve comecar por plugins/cache/tema antes de reescrever codigo.
- Na Cotacao V2, a primeira otimizacao estrutural deve ser incremental: medir, criar endpoint de eventos/delta, usar delta no reload periodico e so depois reduzir renderizacao completa da grade.
- Antes de criar o endpoint delta, a Etapa 1 adicionou indices aditivos e diagnostico de seguranca/performance, mantendo o contrato de snapshot intacto.
- A Etapa 2 criou `GET /cotacao/api/events?after=` e passou o refresh automatico do frontend para esse caminho incremental, preservando bootstrap como fallback.

## Riscos ao alterar

- Cache pode esconder bugs de redirect/HTTPS.
- `advanced-cache.php` pode servir HTML antigo antes de `wp-config.php` chegar nos filtros de tema/MU plugin se `WP_CACHE` estiver ligado.
- Buffer de saida no tema pode mascarar fontes antigas de URL; se voltar a aparecer `http://`, procurar tambem plugins que imprimem HTML muito cedo.
- Como `/` nao carrega WordPress enquanto a regra de `home.php` estiver ativa, problemas visuais restantes na primeira tela tendem a ser deploy/proxy/cache do navegador ou edicao fora da pasta correta.
- Se `https://wimifarma.com/home.php` retornar 404, o problema visual publico ainda nao esta no CSS; o arquivo de estabilizacao nao chegou ao servidor publico.
- Plugins premium ignorados pelo Git podem existir no ambiente e afetar comportamento.
- Aumentar recursos sem medir pode mascarar problema de plugin.
- Animacoes da home nao devem bloquear clique nos cards nem cobrir permanentemente os acessos.

## Pendencias

- Medir tempos reais no VPS para `/` e `/wp-login.php`.
- Listar plugins ativos no WordPress.
- Revisar SpeedyCache e plugins vindos do HostGator.
- Decidir quando a home pode voltar para WordPress, se isso ainda for desejado.
- Definir quando e como reativar cache publico com limpeza automatica e validacao de mixed content.
- Criar metrica simples de tempo de resposta pos-deploy.
- Confirmar que caches legados `endurance-page-cache/`, `advanced-cache.php`, `cache/` e `speedycache-config/` nao estao servindo a home antiga no VPS.
- Medir no VPS real a Cotacao V2 com dados reais da equipe: `/cotacao/api/bootstrap`, `/cotacao/api/diagnostics`, `/miauw/widget-status.php`, tamanho do payload e consumo dos containers.
- Remover `loadSheet()` de mutacoes simples da Cotacao, como salvar celula, largura de coluna, estilo e regra, preservando fallback por bootstrap completo.
- Avaliar separar o carregamento do widget do Miauby da renderizacao inicial da grade se `widget-status.php` continuar com picos acima de 500 ms no VPS.
- Confirmar no VPS que `/cotacao/api/diagnostics.performance.expectedIndexes` lista todos os indices da Etapa 1 como existentes.
- Medir no VPS a diferenca entre `/cotacao/api/events?after=` sem eventos novos e `/cotacao/api/bootstrap` com dados reais.

## Evolucao futura

- Criar checklist de performance WordPress.
- Ativar cache com regras claras depois de HTTPS.
- Adicionar monitoramento de tempo de resposta.
- Considerar separar tarefas pesadas em jobs.
- Virtualizar a grade da Cotacao quando o volume real passar a milhares de celulas visiveis.
