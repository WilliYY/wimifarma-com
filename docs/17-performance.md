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
- A home standalone usa video de fundo em tela inteira, logo animada propria sem fundo e tres GIFs animados decorativos; manter o movimento leve e reaproveitar o padrao dos logins.
- Em 2026-05-31, o asset comum da trilha do XP (`site/xp/assets/bloco-xp.svg`) manteve a arte original do bloco, mas deixou de usar a exportacao base64 gigante. O arquivo passou a embutir um PNG transparente otimizado, caindo de cerca de 23,9 MB para cerca de 89 KB, mantendo o mesmo caminho publico e apenas atualizando o cache-bust em `apps/xp/src/server.ts`.
- Em 2026-05-31, os `favicon.svg` compartilhados por Home/tema, Cotacao, Tarefa, Financeiro e Miauby foram otimizados mantendo o mesmo visual: cada arquivo caiu de cerca de 1,07 MB para cerca de 2,7 KB, sem mudar os links HTML nem os favicons PNG alternativos.
- Em 2026-05-31, o cache de assets estaticos foi reforcado sem ativar cache de pagina: `site/.htaccess` passou a enviar cache forte para imagens, SVG, video e fontes, cache curto para CSS/JS, e os apps Node passaram a sobrescrever `no-store` somente para arquivos estaticos de midia/imagem/fonte. HTML, PHP, APIs, health checks e sessoes continuam sem cache agressivo.
- Em 2026-06-01, a animacao de troca de cor do footer liquido do login foi desativada em `site/home.php` para evitar piscada/repaint perceptivel no Chrome. A animacao liquida original do footer foi restaurada com 128 bolhas e filtro SVG, mas com fundo ciano estatico e camada isolada por `contain`/`translateZ(0)`, preservando o visual bonito sem voltar a animar a cor do bloco inteiro.
- Em 2026-06-01, o topo do login passou a usar 28 estrelas cadentes leves em CSS puro, renderizadas sem fundo preto sobre o ciano, atravessando a largura da area superior atras do formulario/video e com reducao automatica em telas pequenas. A camada nao usa JS nem assets externos e respeita `prefers-reduced-motion`.
- Em 2026-06-01, a tela de login passou a reutilizar o mesmo GIF `logo-wimifarma-home-animated.gif` da home autenticada, sem novo asset e sem JS extra; o SVG oficial continua nos modulos internos.
- Em 2026-06-01, o footer do login ganhou contador anonimo de visitantes em PHP puro, sem JS, banco novo ou chamada externa. Ele usa arquivo JSON pequeno em `site/wp-content/uploads/wimifarma-runtime/home-counter.json`, trava escrita com `flock`, ignora user-agents de bots/checks comuns para nao inflar validacoes e mostra separadamente visitantes unicos e acessos registrados. Se o arquivo estiver zerado e o navegador ja tiver cookie antigo, a primeira visualizacao humana inicializa 1 visitante para evitar o card preso em zero.

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

## Cotacao V2 - Etapa 3 de mutacoes leves em 2026-05-14

A Etapa 3 reduziu trabalho repetido no backend sem mudar a experiencia da planilha:

- Mutacoes simples passaram a usar `getOrCreateDefaultQuote()` e consultas pontuais de validacao em vez de chamar `loadSheet()`.
- Foram cobertos salvar celula, colagem em lote, estilos manuais, regras condicionais, inserir/apagar/restaurar/redimensionar colunas e inserir/apagar linhas.
- A validacao de coluna agora consulta apenas a coluna-alvo e confirma se ela esta visivel e, quando necessario, se nao e calculada.
- A validacao de linha para estilos consulta apenas a linha ativa alvo.
- `/cotacao/api/bootstrap` continua sendo o fallback completo de recuperacao da tela.
- `loadSheet()` permanece de proposito em rotas que realmente precisam do snapshot inteiro: bootstrap, diagnostico, backup, import/export Google Sheets e restore.
- `/cotacao/api/diagnostics.safety.stage` passou para `etapa-3` e indica `simpleMutationSnapshotAvoidance: true`.

Esse passo nao e uma virtualizacao da grade ainda, mas tira um gargalo importante: acoes frequentes deixam de escalar com todas as linhas/regras/estilos existentes quando so precisam validar uma celula ou coluna.

## Cotacao V2 - ajuste de digitacao em 2026-05-14

Apos validacao publica do deploy das Etapas 1, 2 e 3, a digitacao em celulas recebeu um ajuste conservador no frontend:

- o auto-ajuste de altura da celula continua existindo para textos longos;
- durante `input`, esse ajuste passou a ser agendado por `requestAnimationFrame`;
- isso evita recalcular layout imediatamente a cada tecla, reduzindo a sensacao de lag ao digitar sem alterar save, sync, filtros, regras ou renderizacao apos commit.

Esse ajuste nao substitui uma virtualizacao completa da grade. Se a Cotacao crescer para muitas centenas ou milhares de linhas visiveis, o proximo ganho relevante continua sendo virtualizar linhas/colunas ou reduzir `renderTable()` completo em acoes de commit.

## Cotacao V2 - Etapa 4 de troca de celula em 2026-05-14

A Etapa 4 atacou o lag percebido ao sair de uma celula e ja digitar em outra:

- o commit de uma celula passou a aplicar o novo valor localmente antes da resposta HTTP;
- a API continua recebendo `expectedValue` para preservar deteccao de conflito;
- a tela nao espera o save da celula anterior para permitir selecao/edicao de outra celula;
- ao salvar uma celula simples, o frontend redesenha apenas a linha afetada, mantendo o calculo de `Ganhador`, destaque de menor preco e regra condicional daquela linha;
- se a API responder erro ou conflito, o valor local e revertido ou marcado visualmente sem descartar a tela inteira.

Essa etapa ainda nao virtualiza a grade inteira. Ela reduz o caminho mais frequente da operacao diaria: digitar, clicar em outra celula e continuar trabalhando sem esperar rede/render completo a cada commit simples.

## Cotacao V2 - Etapa 5 de lotes visiveis em 2026-05-15

A Etapa 5 levou a mesma ideia de fluidez para operacoes que mexem em varias celulas:

- colagem de matriz, `Ctrl+Z`/`Ctrl+Y` de lotes e alca de preenchimento aplicam valores localmente antes da resposta HTTP;
- o frontend aguarda saves pendentes da mesma celula antes de montar um lote, reduzindo corrida entre edicao simples e preenchimento;
- a confirmacao de lote usa `PATCH /cotacao/api/cells/batch` e atualiza apenas as linhas afetadas, evitando `renderTable()` completo quando nao ha mudanca estrutural;
- outras abas que recebem eventos `cell_updated` ou `cells_batch_updated` tambem redesenham apenas as linhas afetadas;
- estilos copiados pelo fill handle ou aplicados/apagados em selecoes grandes usam `PUT/DELETE /cotacao/api/styles/batch`, reduzindo varias requisicoes pequenas e eventos soltos.

Essa etapa ainda mantem `/cotacao/api/bootstrap` como fallback completo para coluna, import, restore e outros eventos estruturais. O proximo gargalo provavel continua sendo virtualizacao se o volume real crescer para muitas centenas de linhas visiveis.

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
- Cache forte deve ficar restrito a assets estaticos por extensao; paginas, PHP, APIs e endpoints internos precisam continuar com `no-store` ou sem cache agressivo.
- Ao trocar imagens, SVGs, videos ou fontes ja publicados, usar cache-bust por query string ou nome de arquivo quando a troca precisar aparecer imediatamente.
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
- A Etapa 3 removeu `loadSheet()` de mutacoes simples e manteve snapshots completos apenas para leitura inicial, diagnostico e operacoes fortes.
- A Etapa 4 passou save de celula para fluxo otimista no frontend e reduziu `renderTable()` em commits simples, atualizando somente a linha afetada.

## Riscos ao alterar

- Cache pode esconder bugs de redirect/HTTPS.
- `advanced-cache.php` pode servir HTML antigo antes de `wp-config.php` chegar nos filtros de tema/MU plugin se `WP_CACHE` estiver ligado.
- Buffer de saida no tema pode mascarar fontes antigas de URL; se voltar a aparecer `http://`, procurar tambem plugins que imprimem HTML muito cedo.
- Como `/` nao carrega WordPress enquanto a regra de `home.php` estiver ativa, problemas visuais restantes na primeira tela tendem a ser deploy/proxy/cache do navegador ou edicao fora da pasta correta.
- Se `https://wimifarma.com/home.php` retornar 404, o problema visual publico ainda nao esta no CSS; o arquivo de estabilizacao nao chegou ao servidor publico.
- Plugins premium ignorados pelo Git podem existir no ambiente e afetar comportamento.
- Aumentar recursos sem medir pode mascarar problema de plugin.
- Animacoes da home nao devem bloquear clique nos cards nem cobrir permanentemente os acessos.
- Assets SVG grandes do XP, especialmente elementos vindos do Canva, devem ser observados no VPS; se a trilha ficar lenta, otimizar/exportar versoes menores antes de adicionar mais animacoes.
- A trilha XP deve renderizar uma janela curta de niveis: base 1 a 20 no inicio e, quando a equipe passar disso, uma janela em torno do nivel mais alto. Para niveis 50+, evitar renderizar todos os niveis anteriores; preferir janela deslizante, agrupamento de avatares por nivel e resumo clicavel separado. Se o gargalo persistir, otimizar os SVGs grandes ou trocar blocos repetidos por assets raster/sprite mais leves.
- O XP usa indices em `xp_sales (deleted_at, employee_id, sale_date)` e `xp_sales (deleted_at, sale_date)` para reduzir custo das agregacoes de vendas ativas por funcionario/mes no Postgres. Se o volume crescer para muitos anos de vendas, considerar uma tabela de totais mensais por funcionario em vez de recalcular todo historico a cada carregamento.

## Pendencias

- Medir tempos reais no VPS para `/` e `/wp-login.php`.
- Listar plugins ativos no WordPress.
- Revisar SpeedyCache e plugins vindos do HostGator.
- Decidir quando a home pode voltar para WordPress, se isso ainda for desejado.
- Definir quando e como reativar cache publico com limpeza automatica e validacao de mixed content.
- Criar metrica simples de tempo de resposta pos-deploy.
- Confirmar que caches legados `endurance-page-cache/`, `advanced-cache.php`, `cache/` e `speedycache-config/` nao estao servindo a home antiga no VPS.
- Medir no VPS real a Cotacao V2 com dados reais da equipe: `/cotacao/api/bootstrap`, `/cotacao/api/diagnostics`, `/miauw/widget-status.php`, tamanho do payload e consumo dos containers.
- Medir no VPS a diferenca de latencia das mutacoes simples da Cotacao apos a Etapa 3, especialmente salvar celula, colagem em lote, aplicar cor e editar regra condicional.
- Avaliar separar o carregamento do widget do Miauby da renderizacao inicial da grade se `widget-status.php` continuar com picos acima de 500 ms no VPS.
- Confirmar no VPS que `/cotacao/api/diagnostics.performance.expectedIndexes` lista todos os indices da Etapa 1 como existentes.
- Medir no VPS a diferenca entre `/cotacao/api/events?after=` sem eventos novos e `/cotacao/api/bootstrap` com dados reais.

## Evolucao futura

- Criar checklist de performance WordPress.
- Ativar cache com regras claras depois de HTTPS.
- Adicionar monitoramento de tempo de resposta.
- Considerar separar tarefas pesadas em jobs.
- Virtualizar a grade da Cotacao quando o volume real passar a milhares de celulas visiveis.
