# 07 - Historico de decisoes

Este documento registra decisoes tecnicas importantes. Sempre que uma decisao for tomada, alterada ou substituida, registre data aproximada, decisao, motivo, arquivos/modulos impactados e riscos futuros.

## 2026-05-16 - Miauby preserva personalidade no motor agente

Decisao:

- Criar a Fase 10 do Miauby com contrato versionado de personalidade (`miauby-persona-2026-05-16`).
- Expor `personality_version` no status PHP e no health do servico Node.
- Reforcar o prompt do Node para preservar o tom de fiscal interno, humor curto, bordoes controlados, pedido minimo de contexto e regra de nao inventar dados.
- Adicionar `npm run check:persona` em `apps/miauw-agent` para evitar regressao para resposta generica antes do deploy.

Motivo:

- Durante o corte controlado para o Node, o Miauby passou a responder corretamente, mas seco demais. A personalidade precisa virar contrato testavel, nao depender de lembranca manual.

Impacto:

- `apps/miauw-agent/`
- `site/miauw/diagnostico.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-evals.php`
- `site/miauw/miauw-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- Humor nao pode virar falta de precisao: dados reais continuam exigindo fonte do sistema ou do operador.
- Acoes fortes continuam com confirmacao humana e escrita controlada pelo PHP ate cada tool ser migrada com auditoria.
- Coletar exemplos reais bons/ruins do `adm` para ampliar evals antes de liberar mais usuarios.

## 2026-05-16 - Miauby ganha corte acelerado por engine

Decisao:

- Adicionar `MIAUW_ENGINE=php|node_shadow|node` para alternar o motor do Miauby por ambiente.
- Manter `adm` como usuario padrao liberado em `MIAUW_AGENT_ENGINE_ALLOWED_USERS`.
- Adicionar `MIAUW_MAINTENANCE_MODE` para bloquear usuarios comuns durante implantacao acelerada, com `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`.
- Preservar PHP como dono de login, sessoes, confirmacoes, registry, traces e escritas fortes mesmo quando o Node vira resposta oficial para `adm`.

Motivo:

- Acelerar a validacao real do Miauby agente enquanto a equipe fica sem usar o chat, sem perder rollback rapido.

Impacto:

- `apps/miauw-agent/`
- `docker-compose.yml`
- `site/miauw/api.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/diagnostico.php`
- `site/miauw/widget-status.php`
- `.env.example`
- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- O Node ainda nao executa escrita real; tools fortes continuam pelo PHP e com confirmacao.
- Rollback imediato e voltar `MIAUW_ENGINE=php` e reiniciar `wimifarma-com-web`.
- Nao liberar usuarios alem de `adm` antes de coletar traces/evals suficientes.

## 2026-05-15 - Miauby inicia servico agente dedicado em modo sombra

Decisao:

- Criar `apps/miauw-agent` como servico Node.js 22 + TypeScript com `@openai/agents`.
- Publicar `/miauw/agent/` pelo Apache para `wimifarma-miauw-agent:3100`.
- Manter `site/miauw/api.php` como motor oficial do chat enquanto o servico novo roda em modo sombra.
- Exigir token interno nos endpoints `run` e `stream`; `health` e `status` nao devem expor segredos.

Motivo:

- Evoluir o Miauby para uma arquitetura de agente operacional moderna sem quebrar login, widget, confirmacoes, registry, traces e tools PHP ja auditadas.

Impacto:

- `apps/miauw-agent/`
- `docker-compose.yml`
- `docker/php/Dockerfile`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-evals.php`
- `.env.example`
- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- Nao trocar o chat para o servico novo sem volume suficiente de traces do adaptador PHP e evals comparando respostas.
- Nao duplicar regra de negocio de escrita fora das tools PHP auditadas.
- Manter `MIAUW_AGENT_INTERNAL_TOKEN` e `MIAUW_GUARDIAN_TOKEN` fora do Git.

## 2026-05-10 - Migrar projeto do HostGator para VPS com Docker

Decisao:

- Rodar o projeto em VPS Ubuntu/Oracle usando Docker Compose.

Motivo:

- Ganhar flexibilidade, controle de ambiente, deploy rastreavel e possibilidade de evoluir modulos internos.

Impacto:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `site/`
- `mysql/`

Riscos/cuidados:

- Preservar dados importados.
- Validar performance no VPS.
- Nao publicar MySQL.

## 2026-05-10 - Separar banco WordPress e banco dos apps internos

Decisao:

- Usar `wimifarma_wp` para WordPress e `wimifarma_app` para Cashback, Cotacao, Financeiro, Tarefas e Miauby.

Motivo:

- Reduzir acoplamento entre WordPress e ferramentas internas.

Impacto:

- `site/wp-config.php`
- `site/cashback/config.php`
- `docker/mysql/init/01-create-databases.sql`

Riscos/cuidados:

- Manter prefixo `wptl_` no WordPress.
- Nao misturar tabelas novas no banco errado.

## 2026-05-10 - Manter segredos fora do Git

Decisao:

- Versionar `.env.example`, mas nao `.env`, `config.local.php`, `mysql/`, dumps, backups ou plugins premium.

Motivo:

- Repositorio GitHub estava publico no inicio da organizacao e o projeto contem dados internos.

Impacto:

- `.gitignore`
- `.dockerignore`
- `site/miauw/config.local.example.php`
- `README.md`
- `AGENTS.md`

Riscos/cuidados:

- Conferir `git status` e diffs antes de commits.
- Nunca colar chaves reais em documentacao.

## 2026-05-10 - Nginx Proxy Manager como entrada publica

Decisao:

- Usar Nginx Proxy Manager no VPS para receber `80/443` e encaminhar `wimifarma.com` para `wimifarma-com-web:80`.

Motivo:

- Facilitar SSL Let's Encrypt e hospedar varios projetos no mesmo VPS.

Impacto:

- Configuracao externa do Nginx Proxy Manager.
- Rede Docker `wimifarma-com-network`.
- DNS GoDaddy.

Riscos/cuidados:

- Nao usar `127.0.0.1:13002` no proxy.
- Garantir que NPM esteja na rede do projeto.
- Aguardar DNS antes de emitir SSL.

## 2026-05-10 - GoDaddy deve gerenciar DNS do dominio

Decisao:

- Usar nameservers padrao da GoDaddy e configurar registros DNS diretamente la.

Motivo:

- Simplificar migracao sem depender dos nameservers antigos da HostGator.

Impacto:

- Registros `A @`, `CNAME www`, NS e TXT existentes.

Riscos/cuidados:

- Remover registros conflitantes como `Parked`.
- Aguardar propagacao.
- Validar com `dig` antes de SSL.

## 2026-05-10 - Desativar cache WordPress em localhost

Decisao:

- Evitar cache local por padrao em `127.0.0.1:3002`/`localhost:3002`.

Motivo:

- WordPress ficou lento/travado no Docker Desktop Windows com plugins/cache restaurados.

Impacto:

- `site/wp-config.php`
- Plugins de cache, especialmente SpeedyCache.

Riscos/cuidados:

- Reavaliar cache em producao depois de HTTPS e URLs corretas.

## 2026-05-10 - Documentacao como memoria longa do projeto

Decisao:

- Criar `README.md`, `AGENTS.md` e documentos em `docs/` como fonte oficial de contexto para futuras conversas.

Motivo:

- O historico antigo do chat ficou indisponivel e o projeto precisa continuar sem depender dele.

Impacto:

- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- Docs desatualizados causam decisoes ruins. Atualizar junto com mudancas relevantes.

## 2026-05-11 - WordPress reconhece HTTPS atras do Nginx Proxy Manager

Decisao:

- Configurar `site/wp-config.php` para marcar a requisicao como HTTPS quando o proxy enviar `X-Forwarded-Proto: https` ou `X-Forwarded-SSL: on`.

Motivo:

- O Apache recebe trafego HTTP interno do Nginx Proxy Manager. Sem esse ajuste, o WordPress pode gerar assets com `http://`, causando mixed content e tela sem CSS/JS no navegador.

Impacto:

- `site/wp-config.php`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Manter o Proxy Host do Nginx Proxy Manager enviando os headers padrao.
- Validar o HTML publico com `curl` para confirmar links `https://` em CSS e JS.

## 2026-05-11 - Redirect HTTPS publico tambem protegido por .htaccess

Decisao:

- Adicionar `site/.htaccess` com redirect HTTP -> HTTPS para hosts publicos, respeitando `X-Forwarded-Proto: https` e ignorando localhost.

Motivo:

- Mesmo com Force SSL ligado no Nginx Proxy Manager, `http://wimifarma.com` ainda respondeu 200 em testes. A regra no Apache cobre esse caso sem afetar o acesso local `127.0.0.1:3002`.

Impacto:

- `site/.htaccess`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Nao remover a condicao de `X-Forwarded-Proto`, pois HTTPS externo chega como HTTP interno ao Apache.
- Validar `curl -I http://wimifarma.com` apos deploy; deve retornar 301 para HTTPS.

## 2026-05-11 - Apache deve permitir .htaccess no document root

Decisao:

- Configurar o Dockerfile para habilitar `AllowOverride All` em `/var/www/html`.

Motivo:

- O projeto depende de `site/.htaccess` para redirects HTTPS e regras WordPress. Se o Apache ignorar `.htaccess`, `http://wimifarma.com` pode continuar respondendo 200 e o navegador abrir a home como "Nao seguro".

Impacto:

- `docker/php/Dockerfile`
- `site/.htaccess`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Regras em `.htaccess` passam a valer no container; validar contra loops e manter excecao para localhost.

## 2026-05-11 - Hosts publicos devem forcar HTTPS no WordPress

Decisao:

- Configurar `site/wp-config.php` para tratar `wimifarma.com` e `www.wimifarma.com` como HTTPS e canonicalizar `WP_HOME`/`WP_SITEURL` para `https://wimifarma.com`.
- Definir `WP_CONTENT_URL` e `FORCE_SSL_ADMIN` para os hosts publicos.
- Adicionar um MU plugin para normalizar URLs publicas de tema/plugins para `https://wimifarma.com`.
- Canonicalizar `www.wimifarma.com` para `https://wimifarma.com` tambem no `.htaccess`.

Motivo:

- Mesmo com DNS, SSL e redirect funcionando, o HTML publico ainda podia sair com CSS/JS/imagens em `http://wimifarma.com/wp-content/...` quando o WordPress nao recebia ou nao reconhecia corretamente os headers do proxy. Isso quebrava o layout por mixed content.

Impacto:

- `site/.htaccess`
- `site/wp-config.php`
- `site/wp-content/mu-plugins/wimifarma-public-https.php`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Esta regra e especifica para os hosts publicos. Manter excecao local para `127.0.0.1:3002` e `localhost:3002`.
- Se novos dominios publicos forem adicionados ao mesmo WordPress, incluir explicitamente na lista ou revisar a canonicalizacao.
- O MU plugin faz substituicao exata apenas dos dominios publicos conhecidos; nao usar para corrigir outros dominios sem revisar.

## 2026-05-11 - Page cache publico fica opt-in durante estabilizacao HTTPS

Decisao:

- Manter `WP_CACHE=false` por padrao durante a migracao.
- Em `wimifarma.com` e `www.wimifarma.com`, permitir cache de pagina somente se `WIMIFARMA_PUBLIC_PAGE_CACHE=true`.
- Definir `DONOTCACHEPAGE` para hosts publicos quando o cache estiver desligado.

Motivo:

- A home publica continuou retornando HTML com assets `http://wimifarma.com/wp-content/...` mesmo depois das correcoes de HTTPS. Como `advanced-cache.php` do SpeedyCache roda antes dos MU plugins quando `WP_CACHE` esta ativo, ele pode servir HTML estatico antigo e quebrar apenas a tela inicial por mixed content.

Impacto:

- `site/wp-config.php`
- `.env.example`
- `AGENTS.md`
- `README.md`
- `docs/01-arquitetura.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/11-seguranca.md`
- `docs/17-performance.md`

Riscos/cuidados:

- O VPS pode ter `advanced-cache.php`, `cache/` e `speedycache-config/` ignorados pelo Git; limpar ou mover esses arquivos runtime apos o deploy.
- Reativar cache publico somente depois de validar que a home nao possui assets `http://wimifarma.com/...`.
- Se houver necessidade de performance antes disso, medir primeiro e documentar a estrategia de cache.

## 2026-05-11 - Tema da home tambem normaliza URLs publicas para HTTPS

Decisao:

- Adicionar helpers HTTPS no tema `wimifarma-cashback-theme`.
- Gerar URLs de assets e links da home por helpers do tema.
- Adicionar filtros de URL e buffer de saida no frontend publico para substituir `http://wimifarma.com`/`www` por `https://wimifarma.com`.

Motivo:

- A home publica continuou visualmente quebrada e o HTML ainda continha assets `http://wimifarma.com/...` mesmo sem o header de SpeedyCache. Como a tela afetada e a home do tema, a correcao precisa existir tambem dentro do tema carregado pela pagina, nao apenas no MU plugin.

Impacto:

- `site/wp-content/themes/wimifarma-cashback-theme/functions.php`
- `site/wp-content/themes/wimifarma-cashback-theme/header.php`
- `site/wp-content/themes/wimifarma-cashback-theme/front-page.php`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Manter a correcao restrita aos hosts publicos `wimifarma.com` e `www.wimifarma.com`.
- Validar depois do deploy com `curl` que a home nao possui assets `http://wimifarma.com/...`.
- Se o erro persistir apos o deploy, o proxy pode estar apontando para outra pasta/container ou o VPS pode nao ter recebido o commit correto.

## 2026-05-11 - Raiz publica servida por home independente do WordPress

Decisao:

- Servir a rota `/` por `site/home.php` via `site/.htaccess`.
- Manter WordPress para `/wp-admin`, `/wp-login.php`, paginas legadas e assets, mas tirar a primeira tela publica do bootstrap WordPress durante a estabilizacao da migracao.

Motivo:

- A home publica continuou visualmente quebrada mesmo com CSS/JS respondendo 200, HTTPS ajustado e cache de pagina opt-in.
- Como apenas a primeira tela estava afetada, uma home independente com CSS embutido reduz a superficie de falha sem reescrever os modulos internos.

Impacto:

- `site/home.php`
- `site/.htaccess`
- `README.md`
- `AGENTS.md`
- `docs/01-arquitetura.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Se `X-Served-By: wimifarma-static-home` nao aparecer na rota `/`, o VPS/proxy nao esta servindo esta versao.
- A home WordPress original continua no tema, mas fica fora da rota publica raiz enquanto a regra estiver ativa.
- Para voltar a home ao WordPress, remover a regra de `site/home.php` somente apos validar cache, HTTPS e layout em producao.

## 2026-05-11 - Cache legado de HostGator nao deve ficar versionado

Decisao:

- Remover `site/wp-content/endurance-page-cache/_index.html` do Git.
- Ignorar `site/wp-content/endurance-page-cache/`.
- Tratar `https://wimifarma.com/home.php` retornando 404 como sinal de deploy/proxy desatualizado antes de novas refatoracoes visuais.

Motivo:

- O arquivo continha HTML estatico antigo da home WordPress quebrada, incluindo `wfwc-home-launchpad` e assets legados.
- A home corrigida esta em `site/home.php`; se o arquivo nao existe no dominio publico, o VPS ainda nao esta servindo o commit atual ou o Nginx Proxy Manager aponta para outra copia.

Impacto:

- `.gitignore`
- `site/wp-content/endurance-page-cache/_index.html`
- `AGENTS.md`
- `README.md`
- `docs/05-comandos.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Nao apagar caches runtime do VPS sem preservar backup/quarentena quando houver duvida.
- Depois do deploy, validar `X-Served-By: wimifarma-static-home` em `/` e `/home.php`.
- Se o header aparecer no container mas nao no dominio, corrigir Nginx Proxy Manager em vez de mexer no tema.

## 2026-05-11 - Home publica reduzida para fundo visual e cards

Decisao:

- Remover da home standalone o hero textual, botoes principais, navegacao superior e painel central.
- Usar o video de cenario como fundo de tela inteira.
- Manter apenas logo e cards inferiores de acesso aos modulos.
- Fazer os tres GIFs decorativos se moverem pela tela e se afastarem suavemente do ponteiro, reaproveitando o padrao de movimento usado nos logins.

Motivo:

- O usuario decidiu que a home publica deve ser mais visual e servir como entrada simples para os sistemas internos, sem blocos explicativos redundantes.

Impacto:

- `site/home.php`
- `README.md`
- `AGENTS.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/07-historico-de-decisoes.md`

Riscos/cuidados:

- Validar desktop e mobile, porque os GIFs ficam em posicao fixa e nao podem cobrir permanentemente os cards.
- Manter `prefers-reduced-motion` respeitado.
- Se novos elementos forem adicionados na home, preservar a regra de nao recriar o hero textual removido nesta decisao.

## 2026-05-11 - Miauby deve evoluir por skills controladas

Decisao:

- Registrar a direcao de evolucao do Miauby em `docs/18-miauby-evolucao-generativa.md`.
- Tratar novas capacidades generativas como skills com schema, permissao, auditoria e testes, antes de liberar automacao de escrita.

Motivo:

- O usuario quer que Miauby entenda padroes e seja mais generativo, mas isso precisa evoluir sem risco de escrita incorreta no banco ou aprendizado de padroes ruins.

Impacto:

- `docs/18-miauby-evolucao-generativa.md`
- `docs/10-integracoes.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Nao adicionar tools soltas sem registry.
- Separar leitura, sugestao e escrita.
- Revisar memorias e padroes aprendidos antes de transformar em automacao.

## 2026-05-11 - Home publica com cards elevados e badge de tarefas

Decisao:

- Subir os cards inferiores da home para abrir espaco para novos cards futuros.
- Manter a home apenas como portal visual de entrada.
- Exibir badge vermelho no card de Tarefas com o total de tarefas abertas retornado por `/tarefa/badge.php`.

Motivo:

- O usuario quer a home simples, visual e pronta para ganhar novos modulos sem reconstruir a tela.
- Tarefas precisa mostrar pendencias de forma imediata.

Impacto:

- `site/home.php`
- `site/tarefa/badge.php`
- `README.md`
- `AGENTS.md`
- `docs/03-fluxos-do-sistema.md`

Riscos/cuidados:

- O badge depende de endpoint publico interno; se o usuario nao estiver autenticado ou o endpoint falhar, a home deve continuar carregando sem quebrar.
- Validar responsividade porque os cards estao mais altos.

## 2026-05-11 - Cotacao ganha primeira camada de presenca ao vivo

Decisao:

- Criar `cotacao_presencas` e a acao `presence_ping`.
- Mostrar total de usuarios usando a Cotacao, chips de presenca e marca visual da celula/coluna onde outro usuario esta ativo.
- Indicar quando outro usuario esta fora do filtro atual.

Motivo:

- O usuario precisa que a Cotacao evolua para uma experiencia forte de uso simultaneo, parecida com Google Sheets, sem divergencia entre computadores.

Impacto:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/api.php`
- `site/cotacao/index.php`
- `site/cotacao/app.js`
- `site/cotacao/styles.css`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Esta camada mostra presenca, mas ainda nao resolve conflito forte de escrita.
- O proximo passo deve ser conflito por campo, auditoria de eventos e avaliacao de WebSocket/SSE.

## 2026-05-11 - Miauby formaliza registry de skills

Decisao:

- Criar `miauw_skill_registry()` com metadados de modulo, nivel, risco, permissao, executor, entrada, saida, auditoria e efeitos.
- Expor diagnostico seguro por `diagnostico_skills`.
- Usar o registry como contexto do Miauby antes de novas autonomias.

Motivo:

- O usuario quer um Miauby mais generativo, capaz de entender padroes e apoiar operacao, mas sem liberar escrita solta no banco.

Impacto:

- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-funcoes.php`
- `docs/18-miauby-evolucao-generativa.md`

Riscos/cuidados:

- Registry nao substitui testes. Skills de escrita ainda precisam de validacao, logs estruturados e revisao de padroes.
- Novas tools OpenAI devem ser registradas antes de uso.

## 2026-05-11 - Cotacao otimiza categoria antes de trocar stack

Decisao:

- Manter PHP/MySQL na Cotacao por enquanto e corrigir primeiro a travada de categoria no frontend.
- Usar debounce curto para recalculo de lista de categorias, filtro da grade e opcoes de vencedor.
- Validar sincronizacao com duas sessoes antes de propor troca de linguagem ou banco.

Motivo:

- A travada observada ao mexer em categoria era compativel com recalculo de UI/filtro a cada tecla, nao necessariamente com limite do MySQL.
- Trocar linguagem ou banco sem medir poderia aumentar risco de migracao sem resolver o gargalo real.

Impacto:

- `site/cotacao/app.js`
- `docs/19-cotacao-tempo-real.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Se a tabela crescer muito, `sync_pull` ainda pode ficar pesado por enviar snapshots completos.
- A proxima evolucao para se aproximar do Sheets deve ser snapshot incremental e canal SSE/WebSocket com eventos por celula/linha.

## 2026-05-11 - Miauby reduz trabalho repetido no status e no contexto

Decisao:

- Criar `miauw_intelligence_active_alert_count()` para contar alertas ativos com `COUNT(*)`.
- Usar o contador em widget, API e painel em vez de carregar ate 30 alertas completos apenas para badge.
- Filtrar conhecimentos por termos relevantes em `miauw_knowledge_for()` antes do ranking.

Motivo:

- O widget e as respostas do Miauby precisam ficar leves enquanto a memoria, alertas e padroes aumentam.
- O usuario quer evoluir Miauby como assistente generativo, mas sem aumentar latencia nem expor detalhes tecnicos desnecessarios.

Impacto:

- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/api.php`
- `site/miauw/widget-status.php`
- `site/miauw/widget-alerts.php`
- `site/miauw/index.php`
- `docs/18-miauby-evolucao-generativa.md`

Riscos/cuidados:

- O pre-filtro de conhecimento precisa ser revisado com exemplos reais para nao esconder informacoes antigas importantes.
- Codigo, SQL e stack traces devem continuar fora das respostas operacionais do Miauby para usuarios finais.

## 2026-05-11 - Miauby so alerta encomenda da Cotacao depois de mais de 1 dia

Decisao:

- Alterar o alerta `cotacao_encomenda_parada` para considerar somente encomendas com mais de 1 dia sem baixa/pedido.
- Centralizar um comentario curto de balao para esse alerta e repassar o texto por `widget-status.php`, `widget-alerts.php` e `api.php`.
- Atualizar o cache-buster do `widget.js` para garantir que os modulos carreguem a versao nova do balao.

Motivo:

- O usuario quer que Miauby comente encomendas apenas quando elas passaram tempo suficiente para exigir revisao operacional, evitando ruido em encomendas recentes.

Impacto:

- `site/miauw/miauw-intelligence.php`
- `site/miauw/widget.js`
- `site/miauw/widget-status.php`
- `site/miauw/widget-alerts.php`
- `site/miauw/api.php`
- paginas que carregam `/miauw/widget.js`

Riscos/cuidados:

- Se a data da encomenda estiver ausente ou incorreta, o alerta pode atrasar ou aparecer indevidamente.
- O balao deve continuar curto e sem codigo; detalhes completos ficam na aba de alertas.

## 2026-05-11 - Cotacao remove duplicidade de categoria e evita snapshot proprio

Decisao:

- Remover a cor automatica fixa de `urgente` e `encomenda` baseada em classes CSS/JS antigas.
- Deixar cores de categoria sob responsabilidade das regras de formatacao condicional em `cotacao_regras_formatacao`.
- Atualizar a versao conhecida de sync no frontend apos mutacoes locais, evitando que a propria aba reaplique via `sync_pull` um snapshot completo que ela acabou de salvar.
- Evitar rebuild visual da lista de categorias quando o popover esta fechado.
- Evitar toque duplicado de sync ao adicionar categoria dentro de `cotacao_save_item()`.

Motivo:

- O usuario relatou lag persistente ao alterar categoria e lembrou que antes havia regra fixa para `urgente`/`encomenda`, depois substituida por bloco de formatacao condicional.
- A auditoria encontrou dois fatores de travamento: duplicidade visual da categoria e self-replay de snapshot apos save local.

Impacto:

- `site/cotacao/app.js`
- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/styles.css`
- `docs/19-cotacao-tempo-real.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Se o usuario quiser mudar a cor de `urgente` ou `encomenda`, deve editar a regra condicional, nao recriar CSS fixo.
- A Cotacao ainda usa polling e snapshot; para comportamento realmente proximo do Google Sheets, o proximo salto e evento incremental com SSE/WebSocket e conflito por campo.
- Testes de schema devem ser sequenciais para evitar lock temporario no MySQL.

## 2026-05-11 - Cotacao inicia sync incremental por eventos

Decisao:

- Criar `cotacao_eventos` como fila incremental de alteracoes da Cotacao.
- Criar `sync_events_pull` para a tela buscar eventos antes de recorrer a `sync_pull` com snapshot completo.
- Registrar `client_id` nas mutacoes locais para a propria aba ignorar eventos que ela acabou de gerar.
- Adicionar versoes por item/campo e preco em `cotacao_itens.versoes` e `cotacao_precos.versao`.
- Impedir que filtro ativo de categoria seja reaplicado a cada tecla dentro da celula; o filtro recalcula no fim da edicao.

Motivo:

- Aproximar a Cotacao do comportamento do Google Sheets sem trocar stack antes de medir gargalos reais.
- Reduzir travadas e saltos de linha ao editar categorias como `encomenda`.
- Preparar a base para conflito por campo e futuro SSE/WebSocket.

Impacto:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/api.php`
- `site/cotacao/index.php`
- `site/cotacao/app.js`
- `docs/19-cotacao-tempo-real.md`
- `docs/02-banco-de-dados.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Eventos incrementais ainda usam polling; o delay minimo segue limitado pelo intervalo atual.
- Mudanca estrutural ou atraso grande ainda deve cair para snapshot completo.
- O proximo passo para ficar mais perto do Sheets e exibir conflito por campo e trocar o transporte para SSE/WebSocket, nao trocar banco/linguagem sem medicao.

## 2026-05-11 - Cotacao desacopla palavras-gatilho de prioridade e filtro de cor

Decisao:

- Remover o ajuste automatico de `prioridade=encomenda` quando a categoria contem `encomenda`.
- Remover `urgente`/`encomenda` como atalhos escondidos no filtro de cor.
- Manter `encomenda_registrada_em` apenas como dado operacional para alerta do Miauby apos 1 dia.
- Evitar recalculo de grade no `sync_events_pull` quando nao chegou evento nem filtro alterado.

Motivo:

- O usuario observou que escrever `encomenda` ou `urgente` ainda fazia a tela saltar/travar.
- Havia comportamento antigo criado antes da formatacao condicional, competindo com a regra configuravel atual.

Impacto:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/app.js`
- `docs/19-cotacao-tempo-real.md`
- `docs/01-arquitetura.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Se a equipe quiser prioridade ou cor automatica, isso deve virar regra explicita, visivel e auditavel, nao gatilho escondido por texto.
- Linhas antigas que ja estavam com `prioridade=encomenda` nao foram alteradas automaticamente para evitar mudanca silenciosa de dados.

## 2026-05-11 - Cotacao remove ultimo gatilho operacional por texto de categoria

Decisao:

- Remover o registro automatico de `encomenda_registrada_em` quando a categoria contem `encomenda`.
- Fazer alertas e resumo do Miauby considerarem `prioridade = 'encomenda'` ou `prioridade = 'urgente'`, nao busca textual em `categoria`.
- Manter a categoria como texto livre e entrada para formatacao condicional configuravel.

Motivo:

- O usuario identificou que escrever `encomenda` e `urgente` ainda podia acionar comportamento antigo e travar/saltar a linha.
- A Cotacao precisa se comportar como planilha: texto digitado nao deve virar comando escondido.

Impacto:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/app.js`
- `site/cotacao/index.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/01-arquitetura.md`
- `docs/06-pendencias.md`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Encomendas criadas corretamente pelo Miauby continuam usando prioridade explicita `encomenda`.
- Linhas antigas com apenas categoria textual `encomenda` e prioridade `normal` deixam de alimentar alerta operacional, por decisao de evitar gatilho invisivel.
- Se for necessario converter historico antigo, criar rotina auditada e revisada pelo usuario antes de alterar dados.

## 2026-05-12 - Cotacao reseta regras legadas de urgente/encomenda

Decisao:

- Desativar automaticamente regras ativas de `cotacao_regras_formatacao` que usam a coluna `categoria` com termos historicos `urgente`, `urgencia`, `urgência` ou `encomenda`.
- Remover esses termos das categorias padrao semeadas pelo schema.
- Manter `urgente` e `encomenda` como texto comum quando digitados na categoria, sem cor, prioridade, alerta ou data operacional escondida.
- Transformar as copias antigas `site/app.js`, `site/api.php` e `site/cotacao-funcoes.php` em shims de compatibilidade para a implementacao real em `site/cotacao/`.

Motivo:

- O usuario confirmou que escrever `urgente` ou `encomenda` ainda travava/saltava a Cotacao.
- O projeto tinha passado por duas fases conflitantes: primeiro essas palavras ganharam comportamento automatico, depois a cor foi movida para formatacao condicional. O reset remove a ambiguidade e evita que regra velha continue competindo com o fluxo novo.

Impacto:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/index.php`
- `site/cotacao/app.js`
- `site/app.js`
- `site/api.php`
- `site/cotacao-funcoes.php`
- `AGENTS.md`
- `README.md`
- `docs/02-banco-de-dados.md`
- `docs/06-pendencias.md`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Se a equipe quiser destacar visualmente `urgente` ou `encomenda` de novo, criar uma regra explicita revisada e registrar a decisao antes de alterar o schema.
- Linhas antigas com prioridade explicita `encomenda` continuam com significado operacional para Miauby; apenas texto de categoria nao deve disparar comportamento.
- Testar categoria em duas abas sempre que mexer no fluxo de formatacao, filtro ou sync.

## 2026-05-12 - Cotacao neutraliza geral e preserva ordem durante edicao

Decisao:

- Desativar automaticamente regras ativas de categoria com termo `geral`.
- Deixar categoria vazia como vazia, sem preencher `geral` automaticamente durante save.
- Parar de enviar `ordem` como campo alterado em saves comuns de linhas existentes.
- Fazer eventos/snapshots remotos aguardarem a edicao local terminar antes de reaplicar filtro ou reordenar linhas.

Motivo:

- O usuario observou que escrever `geral` ou `urgente` ainda podia travar a tela, mover a linha para a primeira posicao e transformar categoria em `geral` sem acao explicita.
- A auditoria encontrou uma regra ativa `categoria contains geral` e um contrato de save que marcava `ordem` como alterada em qualquer edicao.

Impacto:

- `site/cotacao/api.php`
- `site/cotacao/app.js`
- `site/cotacao/cotacao-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Se a equipe quiser usar `geral` como destaque visual, criar regra nova revisada e documentada, sabendo que ela nao pode virar gatilho escondido.
- Mudancas futuras de reordenacao precisam enviar `ordem` de forma explicita para nao conflitar com a protecao contra salto de linha.

## 2026-05-12 - Cotacao endurece contrato de ordem e categoria

Decisao:

- Categoria de novos itens passa a ter default vazio no banco, nao `geral`.
- Regras legadas ativas para categoria tambem cobrem `cotacao/cotação`, alem de `geral`, `urgente` e `encomenda`.
- Saves comuns de linhas existentes deixam de enviar `ordem` no frontend, removem `ordem` no `api.php` e preservam a ordem anterior no backend mesmo quando um payload legado tenta salvar `ordem=1`.
- Eventos de item atualizado removem `ordem` de `changed_fields` quando a ordem real nao mudou.

Motivo:

- O usuario confirmou que palavras de categoria ainda podiam fazer a linha subir para a primeira posicao e travar.
- A auditoria encontrou que um payload antigo podia enviar `ordem=1` durante uma edicao comum de categoria, criando evento de ordem sem reordenacao explicita.

Impacto:

- `site/cotacao/app.js`
- `site/cotacao/api.php`
- `site/cotacao/cotacao-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/02-banco-de-dados.md`
- `docs/06-pendencias.md`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Reordenacao manual futura precisa ter contrato explicito proprio para alterar `ordem`.
- Nao recriar regra escondida por texto de categoria; se quiser cor automatica, usar regra condicional revisada.
- Teste dirigido confirmou que `urgente`, `encomenda`, `geral` e `cotacao` preservam a ordem original mesmo com payload legado `ordem=1`.

## 2026-05-12 - Cotacao deixa filtros local-first por padrao

Decisao:

- Refazer a logica de filtro da Cotacao para que categoria/cor/vencedor sejam locais por tela por padrao.
- Manter `sync_filter` apenas como compatibilidade/diagnostico enquanto `data-shared-filter-sync` nao estiver explicitamente habilitado.
- Sanitizar filtros compartilhados antigos em `cotacao_sync_estado`, removendo `geral`, `urgente`, `encomenda` e `cotacao/cotação`.
- Continuar sincronizando dados, eventos, presenca e celula focada entre usuarios.

Motivo:

- O usuario ainda via a linha subir/travar ao digitar palavras de categoria historicamente usadas como gatilho.
- Filtro compartilhado por palavra podia interferir na visao de outra tela e parecia transformar texto comum em comando escondido.

Impacto:

- `site/cotacao/app.js`
- `site/cotacao/cotacao-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/02-banco-de-dados.md`
- `docs/06-pendencias.md`
- `docs/19-cotacao-tempo-real.md`

Riscos/cuidados:

- Se filtro compartilhado voltar a ser necessario, habilitar de forma explicita e testar com duas telas antes de producao.
- Nao reintroduzir gatilho por texto de categoria; cor deve vir de regra condicional revisada e filtro deve ser acao local do usuario.

## 2026-05-12 - Cotacao V2 substitui a planilha PHP antiga

Decisao:

- Reestruturar diretamente `/cotacao/` como um servico Node.js/Express/Socket.IO em `apps/cotacao`.
- Usar Postgres `wimifarma_cotacao` para linhas, colunas, eventos e regras condicionais.
- Usar Redis para sessoes e presenca temporaria.
- Manter o login usando `wf_users` no MySQL para preservar os usuarios existentes.
- Publicar a V2 por proxy interno do Apache em `wimifarma-com-web`, mantendo o Nginx Proxy Manager apontando para `wimifarma-com-web:80`.

Motivo:

- A Cotacao PHP antiga acumulou regras historicas de categoria que ainda causavam salto para primeira linha, travamento e comportamento escondido para `geral`, `urgente`, `encomenda` e `cotacao`.
- Como os dados oficiais estavam no Google Sheets, o usuario autorizou trocar o motor da Cotacao diretamente e validar passo a passo.

Impacto:

- `apps/cotacao/`
- `docker-compose.yml`
- `docker/php/Dockerfile`
- `.env.example`
- `.gitignore`
- `README.md`
- `AGENTS.md`
- `docs/01-arquitetura.md`
- `docs/02-banco-de-dados.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/05-comandos.md`
- `docs/06-pendencias.md`
- `docs/19-cotacao-tempo-real.md`
- `docs/20-cotacao-v2.md`

Riscos/cuidados:

- Nao apagar `cotacao-data/` sem backup.
- Nao recriar gatilhos escondidos por palavra de categoria.
- Adicionar `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET` no `.env` do VPS antes do deploy.
- O proximo passo deve ser conflito por campo, diagnostico de sync e import/export Sheets, nao novos remendos na planilha PHP antiga.

## 2026-05-12 - Cotacao V2 adota visual denso de planilha operacional

Decisao:

- Aproximar a tela principal da Cotacao V2 do visual operacional da planilha antiga, com cabecalho compacto, abas locais, estatisticas no topo e grade densa.
- Padronizar as colunas iniciais visiveis como `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, `Anb`, `Profarma`, `mauro`, `arthur`, `Santa`, `tom`, `cimed` e `QUEM GANHOU`.
- Ocultar colunas legadas `observacao` e `status` por `options.hidden`, sem apagar dados.
- Adicionar exportacao CSV rapida no navegador para a visao filtrada atual.

Motivo:

- O usuario validou que a sincronizacao ao vivo esta funcionando e pediu que a aparencia voltasse a se aproximar da planilha anterior.
- A interface antiga era mais eficiente para a rotina de comparacao de fornecedores; a mudanca visual nao deve desfazer o backend novo em tempo real.

Impacto:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `README.md`
- `AGENTS.md`
- `docs/06-pendencias.md`
- `docs/20-cotacao-v2.md`

Riscos/cuidados:

- As abas `Farmacia Popular` e `Bebe` sao filtros locais por categoria, nao motores separados de cotacao.
- A exportacao CSV atual e um recurso rapido da tela; import/export oficial com Google Sheets ainda precisa de IDs estaveis, auditoria e tratamento de conflito.
- Nao reintroduzir gatilhos escondidos por texto para `geral`, `urgente`, `encomenda` ou `cotacao`.

## 2026-05-12 - Cotacao V2 ganha comportamento de planilha viva

Decisao:

- Fazer a grade da Cotacao V2 ocupar a tela como uma planilha, sem card envolvendo a tabela.
- Manter `EAN`, `PRODUTO`, `QUANTIDADE` e `CATEGORIA` como colunas fixas que nao podem trocar de nome pela interface.
- Tratar colunas de distribuidoras como o unico grupo editavel pelo menu de contexto para adicionar/remover colunas.
- Trocar `QUEM GANHOU` por `Ganhador`, calculado no frontend pelo menor preco numerico entre distribuidoras visiveis.
- Padronizar celulas com fonte 20px, texto centralizado e comportamento mais proximo de planilha.
- Adicionar nomes de animais aleatorios/deterministicos para presenca por aba, no estilo Google Sheets.
- Adicionar menu de contexto para inserir/apagar linhas e inserir/apagar distribuidoras.
- Adicionar paleta de cores manual para linha, coluna e celula, persistida em `cotacao_v2_styles`.

Motivo:

- O usuario pediu uma experiencia mais proxima do Google Sheets, com colaboracao clara, pintura manual, filtros por categoria/ganhador e destaque automatico da distribuidora vencedora.
- A Cotacao precisa continuar livre de gatilhos escondidos por palavras como `urgente`, `encomenda`, `geral` e `cotacao`.

Impacto:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `README.md`
- `AGENTS.md`
- `docs/06-pendencias.md`
- `docs/20-cotacao-v2.md`

Riscos/cuidados:

- Nao permitir que `Ganhador` seja editado manualmente; ele deve ser derivado dos precos.
- Nao permitir apagar/renomear colunas fixas pela interface.
- Testar `/cotacao/socket.io/` sempre que mexer em proxy, presenca ou eventos.
- Cores manuais nao podem virar regra operacional escondida; se uma cor passar a ter significado de negocio, criar schema e documentar.

## 2026-05-13 - Cotacao V2 aproxima fluxo do Google Sheets

Decisao:

- Remover botoes visiveis de adicionar linhas e colar do Sheets.
- Fazer insercao/remocao de linhas e colunas de distribuidoras pelo menu de contexto.
- Usar `Ctrl+V` para colar matrizes na grade e `PATCH /cotacao/api/cells/batch` para salvar em lote.
- Adicionar selecao multipla, celula ativa, navegacao por setas, `Ctrl+Z`/`Ctrl+Y`, botoes de desfazer/refazer e alca visual de preenchimento.
- Mover filtros de `CATEGORIA` e `Ganhador` para icones no cabecalho, com selecionar tudo, limpar tudo e aplicar local por tela.
- Adicionar diagnostico operacional, import/export Google Sheets com `cotacao_row_id`, backup/restore do Postgres, renomear/reordenar distribuidoras com auditoria e borracha de cor manual.

Motivo:

- O usuario quer que a Cotacao chegue o mais perto possivel do Google Sheets, mas sem reintroduzir gatilhos escondidos por palavras como `geral`, `urgente`, `encomenda` ou `cotacao`.
- A operacao precisa de colagem rapida, filtros locais confiaveis, presenca clara, backup antes de importacoes e ferramentas para evoluir distribuidoras sem mexer nas colunas fixas da farmacia.

Impacto:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `docker-compose.yml`
- `.env.example`
- `README.md`
- `AGENTS.md`
- `docs/06-pendencias.md`
- `docs/20-cotacao-v2.md`

Riscos/cuidados:

- Google Sheets so deve ser usado em producao depois de configurar credencial real e testar com planilha controlada.
- Import e restore podem substituir dados ativos; exigir backup e permissao por perfil antes de liberar amplamente.
- A alca de preenchimento ainda e visual; drag-fill real deve ser implementado separadamente se virar necessidade operacional.
- Manter `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA` e `Ganhador` protegidos contra renomeacao/remocao manual.

## 2026-05-14 - Cotacao PHP antiga removida

Decisao:

- Eliminar a Cotacao PHP antiga do repositorio, incluindo `site/cotacao`, `site/app.js`, `site/api.php` e `site/cotacao-funcoes.php`.
- Mover os ativos ainda usados pela Cotacao oficial, como logo, favicon e GIFs de login, para `apps/cotacao/public`.
- Remover do `docker-compose.yml` os mounts que ligavam `wimifarma-cotacao-app` a `site/cotacao`.

Motivo:

- A Cotacao V2 ja substituiu a rota `/cotacao/` e a pasta antiga passou a ocupar espaco e criar ambiguidade.
- Manter um fallback PHP escondido aumentava risco de editar o lugar errado ou diagnosticar bug na base errada.

Impacto:

- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg`
- `apps/cotacao/public/favicon.svg`
- `apps/cotacao/public/favicon.png`
- `docker-compose.yml`
- `site/cotacao/`
- `site/app.js`
- `site/api.php`
- `site/cotacao-funcoes.php`
- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- `/cotacao/` nao tem mais fallback PHP; se falhar, investigar V2, proxy Apache, Postgres, Redis ou login MySQL.
- Nao recriar shims da Cotacao antiga na raiz do `site/`.
- Nao apagar `cotacao-data/`, pois ali ficam os dados vivos da Cotacao V2.

## 2026-05-14 - Pasta oficial unica no VPS

Decisao:

- Consolidar a operacao do VPS em `/home/ubuntu/projetos/wimifarma-com`.
- Tratar pastas parecidas, como `wimifarma-com-git`, `wimifarma-com-code-*` e `wimifarma-com-runti*`, como copias temporarias ate auditoria.
- Arquivar copias paradas em `/home/ubuntu/projetos/_arquivados-wimifarma/AAAA-MM-DD/`, sem apagar direto.

Motivo:

- O WinSCP estava mostrando varias pastas `wimifarma-com*` na raiz de `/home/ubuntu/projetos`, criando risco de editar/deployar a copia errada.
- A operacao diaria precisa de uma pasta clara e previsivel.

Impacto:

- `AGENTS.md`
- `README.md`
- `docs/05-comandos.md`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Antes de mover uma pasta, confirmar com `docker inspect` se ela nao esta montada por containers ativos.
- Preservar `.env`, `mysql/`, `cotacao-data/`, backups e `config.local.php` unicos.
- A quarentena serve para reduzir poluicao visual, nao como autorizacao para apagar dados sem revisao.
