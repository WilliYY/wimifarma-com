# AGENTS.md - Wimifarma

Este arquivo e o manual obrigatorio para qualquer conversa futura do Codex/agentes neste projeto. Ele deve ser mantido atualizado sempre que arquitetura, banco, deploy, seguranca, fluxo de trabalho, integracoes ou regras importantes mudarem.

## Leitura obrigatoria antes de alterar arquivos

Antes de alterar qualquer arquivo, sempre ler:

- `AGENTS.md`
- `README.md`
- arquivos relevantes da pasta `docs/`

Para tarefas de arquitetura, banco, APIs, autenticacao, permissoes, seguranca, deploy, layout, modulos ou integracoes, leia primeiro o documento especifico em `docs/`.

## Regras permanentes

1. Antes de alterar qualquer arquivo, sempre ler `AGENTS.md`, `README.md` e os arquivos relevantes de `docs/`.
2. Nunca reescrever o projeto inteiro sem necessidade.
3. Fazer alteracoes pequenas, rastreaveis e reversiveis.
4. Preservar os padroes ja existentes no projeto, salvo quando houver motivo tecnico claro para alterar.
5. Nao versionar segredos, dumps, backups, volume MySQL, caches, relatorios gerados ou plugins premium ignorados pelo Git.
6. Nao apagar backups ou dados de migracao sem confirmacao clara; quando precisar limpar, mover para local seguro e registrar.
7. Atualizar a documentacao sempre que houver mudanca em:
   - arquitetura;
   - banco de dados;
   - APIs;
   - autenticacao;
   - permissoes;
   - regras de negocio;
   - seguranca;
   - deploy;
   - layout principal;
   - fluxos de usuario;
   - modulos internos;
   - integracoes externas;
   - comportamento importante do sistema.
8. Ao finalizar qualquer tarefa, informar:
   - arquivos alterados;
   - documentacao criada ou atualizada;
   - comandos executados;
   - testes, build ou lint realizados;
   - pendencias abertas;
   - riscos ou cuidados encontrados.

## Contexto atual

- Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle.
- O usuario acessa o VPS por PuTTY e os arquivos por WinSCP.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- O projeto local fica em `C:\Projetos\wimifarma-com`.
- No VPS, a pasta observada e `/home/ubuntu/projetos/wimifarma-com`.
- Backups/dumps antigos foram movidos para fora do projeto local em `C:\Projetos\wimifarma-com-backups-local-20260510`.
- Trate o repositorio como publico enquanto nao houver decisao diferente; nao exponha segredos em commits.

## Stack e estrutura

- Docker Compose com `wimifarma-com-web`, `wimifarma-com-db`, `wimifarma-cotacao-app`, `wimifarma-cotacao-db` e `wimifarma-cotacao-redis`.
- PHP 8.3 + Apache.
- MySQL 8.0.
- Cotacao V2 em Node.js 22 + Express + Socket.IO, com Postgres 17 e Redis 7.
- WordPress na raiz `site/`.
- Home publica da raiz `/` servida por `site/home.php` via `site/.htaccess` durante a estabilizacao da migracao; a primeira tela usa fundo visual em tela inteira, cards inferiores elevados para abrir espaco futuro e GIFs decorativos com o mesmo padrao de movimento dos logins.
- O card de Tarefas na home usa `site/tarefa/badge.php` para mostrar um badge vermelho com a quantidade de tarefas abertas.
- Modulos internos PHP puro:
  - `site/cashback`
  - `site/financeiro`
  - `site/tarefa`
  - `site/miauw`
- A rota `/cotacao/` e servida por proxy interno do Apache para `wimifarma-cotacao-app:3000`; a Cotacao PHP antiga em `site/cotacao` foi removida e os ativos usados pela V2 ficam em `apps/cotacao/public`.
- Banco WordPress: `wimifarma_wp`, prefixo `wptl_`.
- Banco dos apps: `wimifarma_app`.
- Banco da Cotacao V2: Postgres `wimifarma_cotacao`, com dados persistidos em `cotacao-data/postgres`.

## Portas e proxy

Nao misturar portas:

- `wimifarma-com-web:80`: destino correto dentro da rede Docker para o Nginx Proxy Manager.
- `127.0.0.1:3002`: porta local do Compose no VPS/local.
- `127.0.0.1:13002`: tunel local do PuTTY usado em testes no Windows.
- `80/443`: portas publicas do Nginx Proxy Manager.
- `wimifarma-cotacao-app:3000`: destino interno do Apache para `/cotacao/`; nao publicar diretamente no Nginx Proxy Manager.

O Proxy Host de `wimifarma.com` e `www.wimifarma.com` deve apontar para:

```text
scheme: http
forward hostname: wimifarma-com-web
forward port: 80
```

## Segredos

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`
- `cotacao-data/`
- `node_modules/`

Cache de pagina WordPress/SpeedyCache deve ficar opt-in durante a migracao:

- `WP_CACHE=false` por padrao;
- hosts publicos `wimifarma.com` e `www.wimifarma.com` so ativam page cache com `WIMIFARMA_PUBLIC_PAGE_CACHE=true`;
- se a home publica sair com assets `http://wimifarma.com/wp-content/...`, investigar e limpar `site/wp-content/advanced-cache.php`, `site/wp-content/cache/` e `site/wp-content/speedycache-config/`.

O Miauby pode carregar a chave por:

- `site/miauw/config.local.php`, ou
- `MIAUW_OPENAI_API_KEY` no `.env`.

`site/miauw/config.local.php` so deve ser carregado quando estiver legivel pelo PHP; se existir com permissao errada no VPS, o Miauby deve continuar usando `.env` sem fatal error.

## Como rodar local

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas:

- `/cashback/login.php`
- `/cotacao/login.php`
- `/cotacao/health`
- `/financeiro/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/widget-status.php`

## Auditoria antes de encerrar alteracoes

Rode pelo menos:

```powershell
docker compose ps
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/widget-status.php
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
```

Quando mexer em front-end ou fluxo visivel, abrir no navegador e validar visualmente.

## Estado validado em 2026-05-12

- A Cotacao V2 foi reestruturada diretamente em `/cotacao/` com `apps/cotacao` usando Node.js/Express/Socket.IO.
- O Apache do container `wimifarma-com-web` faz proxy de `/cotacao/` e `/cotacao/socket.io/` para `wimifarma-cotacao-app:3000`.
- Os dados novos da planilha ficam em Postgres `wimifarma_cotacao`; sessoes e presenca usam Redis.
- O login da Cotacao V2 continua validando usuario/senha contra `wf_users` no MySQL `wimifarma_app`.
- Palavras historicas `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum na categoria. Nao existe gatilho escondido por palavra para cor, prioridade, ordem, filtro ou alerta.
- Formatacao condicional da Cotacao V2 e explicita, criada/removida pela propria tela em `cotacao_v2_rules`.
- A tela principal da Cotacao V2 usa visual denso de planilha operacional, com cabecalho compacto, abas locais, contador de linhas com dados, presenca no topo, exportacao CSV no navegador e colunas iniciais `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, `Anb`, `Profarma`, `mauro`, `arthur`, `Santa`, `tom`, `cimed` e `Ganhador`.
- A presenca da Cotacao V2 mostra usuarios com nomes aleatorios/deterministicos de animais por aba, no estilo Google Sheets; o usuario real fica apenas como contexto interno/tooltip.
- A grade da Cotacao V2 permite menu de contexto enxuto para inserir linhas, colorir/limpar cor e inserir/apagar somente colunas de distribuidoras. Apagar linha saiu do menu por seguranca; as quatro primeiras colunas e `Ganhador` nao devem ser renomeadas nem apagadas pela interface.
- `Ganhador` e coluna calculada no frontend pelo menor preco numerico entre distribuidoras visiveis; ela nao deve aceitar escrita manual por API ou tela.
- A paleta da Cotacao V2 grava estilos manuais em `cotacao_v2_styles` para linha, coluna ou celula. Cores manuais nao podem virar gatilhos escondidos por texto.
- Validacoes locais passaram para: health da Cotacao, login `adm`, bootstrap, save por celula dessas quatro palavras criticas, criacao/remocao de regra condicional explicita, importacao temporaria de linhas e limpeza dos dados de smoke.
- O proximo passo de Cotacao deve ser evoluir a V2 com conflito visual por campo, auditoria de eventos, import/export Sheets e diagnostico operacional, nao continuar remendando a planilha PHP antiga.

## Estado validado em 2026-05-13

- A Cotacao V2 ganhou fluxo mais proximo do Google Sheets: selecao multipla, celula ativa, setas de navegacao, `Enter` descendo para a celula abaixo, digitacao direta ao selecionar celula, `Ctrl+V` para colar matriz, `Ctrl+Z`/`Ctrl+Y` e botoes de desfazer/refazer.
- Os botoes visiveis `Adicionar linhas` e `Colar do Sheets` foram removidos; inserir linhas fica no menu de contexto e adicionar mais linhas em lote fica no rodape da grade.
- O topo da Cotacao V2 ficou mais compacto, com apenas `Wimifarma Cotacao`, `Home`, `Baixar` e `Sair`; as abas temporarias `Farmacia Popular` e `Bebe` foram removidas, e o diagnostico saiu do menu principal.
- Filtros de `CATEGORIA` e `Ganhador` ficam nos icones do cabecalho da grade, com selecionar tudo, limpar tudo e aplicar selecao local por tela.
- A API recebeu `PATCH /cotacao/api/cells/batch` para colagens em lote, endpoints de diagnostico, backup/restore do Postgres, import/export Google Sheets e renomear/reordenar distribuidoras com auditoria.
- Import/export Google Sheets usa ID estavel de linha (`cotacao_row_id`) para reduzir risco de duplicar ou sobrescrever linhas durante sincronizacao.
- Backup/restore da Cotacao V2 grava em `cotacao-data/backups` no host e `/app/backups` no container; `cotacao-data/` continua fora do Git.
- Conflito visual por campo existe para edicao remota enquanto uma celula local esta em edicao; ainda precisa ser validado com usuarios reais e virar teste automatizado permanente.
- A grade da Cotacao V2 agora permite texto quebrar linha e aumentar a altura da celula, redimensionar largura de colunas pelos titulos, selecionar coluna pelo cabecalho, selecionar linha pelo numero, renomear distribuidora com duplo clique no cabecalho e adicionar 20 linhas no fim da rolagem.
- Apagar distribuidora fica liberado no fluxo normal da equipe; a coluna e ocultada e pode voltar por `Ctrl+Z`/desfazer na mesma sessao.
- `Ctrl+C` copia a selecao como matriz TSV e `Ctrl+V` cola matriz normalizando texto e numeros/precos para o padrao da Cotacao.
- `Ctrl+Z`/desfazer tambem cobre filtros locais, alem de edicoes de celula, colagens, estilos e colunas.
- A formatacao condicional explicita pinta somente o fundo da celula da coluna-alvo que bateu com a regra; o texto da grade permanece preto/padrao para preservar legibilidade.
- Regras de formatacao condicional podem ser editadas e apagadas no modal da propria Cotacao V2.
- A paleta de cores abre por botao no topo ou por `Cores` no menu de contexto, sempre flutuando acima da grade para nao ficar escondida atras das celulas, com tons do mais forte ao mais claro.
- Cores manuais aplicadas por celula, linha ou coluna devem vencer visualmente tons padrao de distribuidora. O destaque automatico azul do menor preco deve ficar por cima enquanto a celula estiver vencendo; quando deixar de vencer, a cor manual reaparece.
- Aplicar cor ou borracha e uma acao unica: apos salvar o estilo da selecao atual, a tela desarma o modo para evitar pintar a proxima celula sem querer.
- O filtro de `Ganhador` mostra contagem por resultado, como `Anb (4)`, ordenando vencedores individuais antes de empates e `Sem vencedor`.
- `PRODUTO` tambem possui filtro por icone; colunas filtraveis possuem filtro de cor no mesmo menu.
- Arrastar pelos cabecalhos de coluna ou numeros de linha amplia a selecao para varias colunas/linhas.
- Ao renomear distribuidora por duplo clique no cabecalho, clicar fora do titulo salva/fecha o editor antes de selecionar a nova celula, deixando apenas a celula clicada ativa.
- A alca de preenchimento no canto da selecao foi ampliada e pode ser arrastada para copiar valores e cores visiveis da selecao para celulas adjacentes, sem escrever em colunas calculadas como `Ganhador`.
- Regras condicionais podem marcar `Data/hora`; quando habilitado, o hover da celula que bateu na regra mostra a data/hora de criacao da regra.
- O campo de busca livre e a borracha fixa do topo foram removidos da Cotacao V2 para reduzir ruido; limpeza de cor permanece no menu de contexto.
- Quando uma edicao faria a linha sair do filtro atual, a tela mantem a linha visivel ate o filtro mudar, evitando a sensacao de que a linha sumiu durante a digitacao.
- A Cotacao V2 mantem heartbeat de presenca e recarregamento leve apos inatividade/reconexao da aba para continuar sincronizando sem depender de recarregar manualmente.
- O widget do Miauby voltou a ser carregado na Cotacao V2, tolera respostas JSON com ruido externo, seus endpoints limpam buffer antes de responder JSON e a tela de login da Cotacao foi compactada para ocupar menos viewport.
- O login do widget do Miauby confirma imediatamente `widget-status.php` apos autenticar; se o navegador nao guardar o cookie de sessao, o widget deve avisar claramente em vez de continuar parecendo anonimo.
- Falta configurar credenciais reais do Google Sheets no `.env` do VPS antes de usar import/export em producao.
- Acoes destrutivas amplas da Cotacao V2, como restore e import, ainda precisam de cuidado operacional antes de uso amplo pela equipe.
- O `fill handle` da selecao ja copia o padrao de valores e cores para celulas adjacentes; series automaticas mais inteligentes, como incrementar numeros/datas, ainda podem evoluir se virar necessidade operacional.
- Pendencias/cuidados atuais para futuros chats: Google Sheets precisa de credenciais reais no `.env` do VPS; restore/import sao acoes fortes e devem ser usadas com backup/revisao; o `fill handle` ja copia valores e cores, mas series automaticas mais inteligentes ainda podem evoluir.

## Estado validado em 2026-05-14

- A Cotacao PHP antiga foi eliminada do repositorio: `site/cotacao`, `site/app.js`, `site/api.php` e `site/cotacao-funcoes.php` foram removidos.
- Os ativos ainda usados pela Cotacao V2, como logo, favicon e GIFs de login, passaram para `apps/cotacao/public`.
- `docker-compose.yml` nao monta mais arquivos de `site/cotacao` no container `wimifarma-cotacao-app`; a V2 e publicada a partir de `apps/cotacao` como fonte oficial unica de `/cotacao/`.
- A partir desta limpeza, `/cotacao/` nao tem fallback PHP legado. Se a rota falhar, diagnosticar o proxy Apache/Node, `wimifarma-cotacao-app`, Postgres e Redis.

## Estado validado em 2026-05-11

- Containers sobem com Docker Compose.
- Banco local importado do HostGator para `mysql/`.
- `wimifarma_app` possui tabelas `wf_*`, `cotacao_*`, `financeiro_*` e `miauw_*`.
- Cotacao usa `cotacao_presencas` para a primeira camada de colaboracao ao vivo: usuarios ativos, filtro local atual, celula/coluna em foco e estado de edicao.
- Cotacao usa `cotacao_eventos` e `sync_events_pull` como primeira camada de sync incremental antes de cair para snapshot completo por `sync_pull`.
- Em 2026-05-11, a Cotacao foi testada com duas sessoes autenticadas: uma sessao criou item, a segunda recebeu por `sync_pull`, edicoes separadas em `produto` e `categoria` foram preservadas por patch de campo, `presence_ping` retornou 2 usuarios e a linha temporaria foi removida.
- Historicamente, a digitacao em `categoria` na Cotacao legada nao deveria recalcular filtro ativo a cada tecla. Na V2, esse comportamento fica em `apps/cotacao/public/app.js`, mantendo filtro local e evitando salto de linha durante edicao.
- Cores de categorias comuns devem vir de `cotacao_regras_formatacao`; nao recriar classes fixas no CSS/JS nem filtro de cor por palavra-chave. As palavras historicas `geral`, `urgente`, `encomenda` e `cotacao/cotação` nao devem ter gatilho automatico por texto na categoria: regras legadas ativas para esses termos sao desativadas por `cotacao_disable_legacy_category_trigger_rules()` e `cotacao_disable_default_category_trigger_rules()`.
- Filtros de categoria/cor/vencedor ficam local-first por padrao. `sync_filter` existe apenas como compatibilidade/estado diagnostico enquanto `data-shared-filter-sync` nao estiver explicitamente habilitado; uma tela nao deve aplicar automaticamente o filtro de outra.
- Categoria vazia nao deve virar `geral` automaticamente durante edicao nem por default de banco. Em linhas existentes, saves de categoria tambem nao devem alterar `ordem`; o frontend remove `ordem` de saves comuns e o backend preserva a ordem anterior mesmo se receber payload legado com `ordem=1`.
- Categoria nao deve alterar `prioridade` nem registrar `encomenda_registrada_em` automaticamente. Alertas de encomenda devem depender de prioridade explicita `encomenda`, criada por usuario/ferramenta controlada, nao de palavra digitada na categoria.
- Apos mutacoes locais da Cotacao, como `save_row`, `delete_row`, `add_empty_rows`, `sync_filter` e regras condicionais, o frontend deve enviar `client_id` e atualizar a versao/evento conhecido para evitar reaplicar na propria tela o que acabou de salvar.
- Quando o popover de categoria estiver fechado, nao reconstruir opcoes de categoria a cada save/digitacao; apenas atualizar a memoria local de categorias.
- Em 2026-05-12, teste dirigido no backend confirmou que salvar categorias `urgente`, `encomenda`, `geral` e `cotacao` com payload legado `ordem=1` preserva a ordem original e registra evento apenas com `changed_fields=categoria`.
- Evite diagnosticos paralelos que chamem `cotacao_ensure_schema()` varias vezes ao mesmo tempo; durante auditoria, rode esse tipo de verificacao em sequencia para reduzir risco de lock/deadlock no MySQL.
- `wimifarma_wp` possui tabelas WordPress `wptl_*`.
- `site/miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava presente.
- Miauby evita carregar 30 alertas completos apenas para contar badge; usar `miauw_intelligence_active_alert_count()` quando precisar de contador.
- `miauw_knowledge_for()` filtra conhecimentos por termos relevantes antes do ranking para manter a memoria escalavel.
- Miauby so cria/comenta alerta de encomenda da Cotacao quando a linha tem prioridade explicita `encomenda` e passou de 1 dia sem baixa/pedido; o comentario curto do alerta e repassado para os baloes do widget em todos os modulos.
- `cashback/login.php`, `cotacao/login.php`, `financeiro/login.php`, `tarefa/login.php` e `miauw/login.php` responderam 200.
- A API legada `cotacao/api.php` respondeu 401 sem sessao durante a migracao; depois da limpeza de 2026-05-14, a API oficial passou a ser `/cotacao/api/...` no servico Node.
- WordPress raiz e `wp-login.php` responderam 200, porem lentos no Docker Desktop Windows com plugins restaurados.
- WordPress local exigiu ajuste para `WP_HOME/WP_SITEURL` em `localhost:3002`.
- Cache WordPress/SpeedyCache ficou opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A home publica `/` ficou desacoplada do WordPress por `site/home.php` e regra em `site/.htaccess`, porque a primeira tela continuou quebrando visualmente mesmo com CSS/JS respondendo 200.
- `endurance-page-cache.php`, mu-plugin especifico de HostGator, foi movido para quarentena fora do projeto.
- `.dockerignore` limita o contexto de build a `docker/php/Dockerfile`, evitando envio de `.env`, `mysql/` e backups ao Docker.

Se a lentidao do WordPress repetir no VPS Linux, investigar primeiro plugins/cache/tema antes de mudar DNS definitivo.

Se o dominio publico continuar mostrando a home antiga com `wfwc-home-launchpad`, valide antes de refatorar:

- `https://wimifarma.com/home.php` deve existir e responder com `X-Served-By: wimifarma-static-home`.
- `/` deve responder com `X-Served-By: wimifarma-static-home`.
- Se `/home.php` retornar 404 no publico, o VPS/proxy nao esta servindo o commit atual ou esta apontando para outra pasta/container.
- Cache antigo de HostGator em `site/wp-content/endurance-page-cache/` nao deve ser versionado nem usado em producao.

## Deploy no VPS

Depois de commitar e enviar para GitHub, se o VPS ja estiver usando Git neste projeto:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

Se for primeiro clone em uma pasta nova:

```bash
cd /home/ubuntu/projetos
git clone https://github.com/WilliYY/wimifarma-com.git wimifarma-com-git
cd wimifarma-com-git
cp .env.example .env
nano .env
docker compose up -d --build
```

Antes de substituir a pasta atual do VPS por uma pasta clonada, preservar `.env`, `mysql/`, arquivos locais de configuracao e backups.

## Direcao futura: Cotacao + Google Sheets

Objetivo do usuario: transformar a cotacao em uma ferramenta forte, espelhada com Google Sheets.

Estado atual:

- A Cotacao V2 ja usa Node.js, Socket.IO, Postgres e Redis em `/cotacao/`.
- A presenca mostra usuarios ativos e celula em foco por WebSocket.
- Filtros sao locais por tela e nao devem ser sincronizados automaticamente entre computadores.
- Categoria e texto comum; nao recriar gatilhos escondidos para `geral`, `urgente`, `encomenda` ou `cotacao`.
- Isso ainda nao substitui um motor completo estilo Google Sheets. Para edicao simultanea forte, evoluir com conflito por campo visivel, auditoria de eventos, import/export Sheets e diagnostico operacional.

Antes de implementar:

- Mapear tabelas `cotacao_*`.
- Definir ID estavel para cada item/linha.
- Definir fonte de verdade por campo.
- Criar auditoria de sync.
- Criar tratamento de conflito.
- Preservar formatacao importante da planilha.
- Criar job/cron de sincronizacao.
- Criar tela de diagnostico do sync.
- Usar Miauby para resumir divergencias e tarefas pendentes.
- Evoluir Miauby por skills controladas, registry de ferramentas, auditoria e revisao de padroes; veja `docs/18-miauby-evolucao-generativa.md`.
- Para tempo real da Cotacao, seguir `docs/19-cotacao-tempo-real.md`.

Evite sincronizacao por string solta. Use API estruturada do Google Sheets quando conector/credencial estiver definido.

## Fluxo de trabalho esperado

- Ler contexto e documentacao antes de agir.
- Fazer uma auditoria curta antes de editar.
- Para problemas visuais apenas na home publica, verificar primeiro `site/home.php` e `site/.htaccess`; WordPress continua responsavel por `/wp-admin`, posts e rotas legadas.
- Alterar pouco por vez.
- Rodar validacoes proporcionais ao risco.
- Atualizar docs quando qualquer comportamento importante mudar.
- Ao final, se houve alteracao de arquivo, preparar commit e orientar o comando de PuTTY para atualizar o VPS.

## Relatorio final obrigatorio

Ao finalizar, responder em portugues com:

- arquivos alterados;
- documentacao criada/atualizada;
- comandos executados;
- testes/build/lint realizados;
- pendencias abertas;
- riscos/cuidados encontrados;
- comando sugerido para o PuTTY quando houver deploy.
