# 06 - Pendencias

## O que esta parte documenta

Backlog tecnico real encontrado durante a migracao e auditoria. Nao representa promessa de funcionalidade pronta; representa itens a investigar ou implementar.

## Alta prioridade

### Finalizar DNS e SSL de `wimifarma.com`

Estado:

- GoDaddy estava sendo ajustado para `A @ -> 146.181.58.208`.
- `www` estava como `CNAME -> wimifarma.com.`
- Nginx Proxy Manager tem Proxy Host para `wimifarma.com` e `www.wimifarma.com`.
- Certificado Let's Encrypt ainda precisava aguardar propagacao DNS/ajuste final.

Risco:

- Ativar Force SSL antes do certificado funcionar pode derrubar acesso publico.

Evolucao:

- Validar `dig`, criar certificado no NPM e testar `https://wimifarma.com`.

### Corrigir URL publica final do WordPress

Estado:

- Localmente `WP_HOME/WP_SITEURL` sao ajustados para `127.0.0.1:3002` ou `localhost:3002`.
- No VPS/testes, WordPress ja mostrou redirects para porta de tunel em algumas condicoes.
- A home publica tambem mostrou HTML antigo com assets `http://wimifarma.com/...`, compativel com cache estatico do SpeedyCache.
- A rota `/` foi estabilizada por `site/home.php`, sem carregar WordPress, enquanto a origem exata do problema visual do tema/cache e investigada.
- Em 2026-05-11, o dominio publico ainda respondeu a home WordPress antiga e `https://wimifarma.com/home.php` retornou 404, indicando deploy/proxy fora do commit atual.
- Foi encontrado cache legado de HostGator versionado em `site/wp-content/endurance-page-cache/_index.html`; ele foi removido do Git e a pasta passou a ser ignorada.

Risco:

- `wptl_options.home` e `siteurl` incorretos causam redirect para HostGator, tunel local ou HTTP.
- `advanced-cache.php` pode servir home antiga antes das correcoes de HTTPS rodarem.

Evolucao:

- Depois do SSL, ajustar `home` e `siteurl` para `https://wimifarma.com` de forma controlada.
- Manter page cache publico desligado ate limpar cache runtime e validar que o HTML nao contem assets `http://`.
- Se voltar a usar a home WordPress na raiz, remover a regra de `site/home.php` somente apos validar visualmente e por `curl` no VPS.
- No VPS, validar `git log -1`, existencia de `site/home.php`, conteudo de `site/.htaccess` e destino do Nginx Proxy Manager antes de editar layout novamente.

### Definir fluxo Git no VPS atual

Estado:

- Projeto local ja esta em Git/GitHub.
- VPS tem pasta existente `/home/ubuntu/projetos/wimifarma-com`.
- Ainda e preciso decidir se a pasta atual sera transformada em Git ou se sera criado clone novo.

Risco:

- Clonar por cima da pasta atual pode apagar `.env`, `mysql/` ou configuracoes locais.

Evolucao:

- Fazer backup, preservar arquivos locais, depois adotar deploy por `git pull`.

## Media prioridade

### Cotacao V2 + Google Sheets

Estado:

- Em 2026-05-12, a Cotacao foi reestruturada como V2 em `apps/cotacao`, usando Node.js/Express/Socket.IO, Postgres e Redis.
- A rota `/cotacao/` passa pelo Apache em `wimifarma-com-web` e e encaminhada para `wimifarma-cotacao-app:3000`.
- O login segue usando a tabela MySQL `wf_users`, preservando o acesso existente.
- A primeira fatia da V2 foi validada com health check, login, bootstrap, save por celula, criacao/remocao de regra condicional explicita e teste das palavras `geral`, `urgente`, `encomenda` e `cotacao`.
- A interface da V2 ja foi aproximada do visual de planilha operacional, com colunas de fornecedores, presenca no topo, contador de linhas com dados e exportacao CSV rapida no navegador.
- A V2 agora ocupa a tela como planilha, usa celulas centralizadas com fonte 20px, mostra usuarios ativos como animais aleatorios/deterministicos por aba, possui menu de contexto para linhas e colunas de distribuidoras, paleta de cores manual e coluna calculada `Ganhador`.
- As colunas `EAN`, `PRODUTO`, `QUANTIDADE` e `CATEGORIA` sao fixas; somente distribuidoras podem ser adicionadas/removidas pela interface.
- `Ganhador` e calculado pelo menor preco numerico entre distribuidoras visiveis e nao deve receber escrita manual.
- Em 2026-05-13, foram adicionados selecao multipla, `Ctrl+V`, `Ctrl+Z`/`Ctrl+Y`, menu de contexto para linhas/colunas, filtros por icone em `CATEGORIA` e `Ganhador`, diagnostico operacional, backup/restore do Postgres, import/export Google Sheets com `cotacao_row_id` e auditoria de renomear/reordenar distribuidoras.
- Em uma rodada posterior de 2026-05-13, a Cotacao ganhou `Ctrl+C` de matriz, `Ctrl+Z` tambem para busca/filtros, menu de filtro reposicionado para nao cortar no canto da tela, limpeza do estado de edicao ao clicar em outra celula, heartbeat/reload leve apos inatividade, widget Miauby na tela e login mais compacto.
- A formatacao condicional da V2 deve continuar explicita e pintar somente o fundo; o texto da grade permanece preto/padrao. Se uma edicao deixar de combinar com filtro/busca ativos, a linha deve permanecer visivel ate o filtro ou a busca mudar.
- Os dados oficiais ainda estao no Google Sheets; a V2 ja tem import/export controlado, mas precisa de credenciais reais e validacao com uma planilha de producao controlada antes de substituir o fluxo da equipe.
- As linhas antigas abaixo descrevem a Cotacao PHP legada e ficam como historico de diagnostico ate a V2 absorver tudo.
- Existem tabelas `cotacao_*` e `cotacao_sync_estado`.
- Existe primeira camada de presenca ao vivo em `cotacao_presencas`, com `presence_ping`, total de usuarios, chips de usuarios ativos e marca visual de celula remota.
- Em 2026-05-11, simulacao com duas sessoes validou `sync_pull`, preservacao de campos separados e presenca com 2 usuarios.
- A digitacao em categoria passou a usar debounce no frontend para reduzir travadas ao recalcular filtro/opcoes.
- Uma auditoria posterior removeu duplicidade entre cores fixas antigas de `urgente`/`encomenda` e a formatacao condicional, e tambem impediu que a propria aba reaplicasse via snapshot completo a mudanca que acabou de salvar.
- Em 2026-05-11, foi criada a primeira fila incremental `cotacao_eventos`, com `sync_events_pull`, `client_id` por aba e versoes por item/preco para reduzir snapshot completo e preparar conflito por campo.
- O filtro ativo de categoria deixou de recalcular durante a digitacao da celula; ele recalcula ao finalizar a edicao, evitando que `encomenda` ou outra categoria mova/esconda a linha no meio da escrita.
- As regras de cor da categoria agora devem ser mantidas em `cotacao_regras_formatacao`.
- `urgente`/`encomenda` nao devem mais atuar como atalhos escondidos de cor/filtro, e `encomenda` nao deve mudar prioridade nem registrar data operacional automaticamente quando for apenas texto de categoria. Em 2026-05-12, regras legadas ativas para esses termos foram desativadas automaticamente pelo schema da Cotacao.
- Em validacao com Browser, escrever `encomenda`/`urgente` em linha nova foi ajustado para nao duplicar a linha visualmente: a tela agora reconhece o save local pendente e mantem uma unica linha por `item_id`.
- Em 2026-05-12, a protecao foi reforcada para `geral`, `urgente`, `encomenda` e `cotacao`: categoria default ficou vazia, saves comuns de linhas existentes nao podem alterar `ordem` e um teste dirigido confirmou que payload legado com `ordem=1` preserva a ordem original.
- Em 2026-05-12, o filtro de categoria/cor/vencedor passou a ser local-first por padrao; `sync_filter` ficou como compatibilidade/diagnostico e filtros compartilhados antigos sao sanitizados para nao reativar `geral`, `urgente`, `encomenda` ou `cotacao`.
- Import e restore continuam sendo acoes fortes e devem ser usados com backup/revisao operacional. Apagar distribuidora ficou liberado para o fluxo diario porque a coluna e ocultada e pode ser restaurada com desfazer na mesma sessao.
- Ainda falta transformar os testes de duas telas, conflito por campo e import/export em testes permanentes de pipeline.
- Cuidados atuais para continuidade: Google Sheets precisa de credenciais reais no `.env` do VPS antes de uso em producao; restore/import sao acoes fortes e devem ser usadas com backup/revisao; o `fill handle` da selecao e visual, mas arrastar para preencher como no Sheets ainda pode evoluir.

Risco:

- Sincronizacao mal desenhada pode duplicar linhas, perder formatacao ou sobrescrever campos importantes.
- Recriar gatilhos escondidos por palavra de categoria reabre o bug que motivou a V2.

Evolucao:

- Definir fonte de verdade por campo, tratamento de conflito, auditoria e job de sync com Google Sheets.
- Evoluir o diagnostico visual para mostrar latencia real por cliente, eventos atrasados e conflitos ativos.
- Criar teste automatizado com duas telas confirmando edicao simultanea, filtros locais, conflito visual e paste em lote.
- Configurar credenciais Google Sheets no VPS e validar import/export com backup antes de migrar dados reais.
- Criar rotina operacional segura para importar e restaurar backup, preferencialmente com backup automatico antes da acao.
- Criar backup agendado e politica de retencao para o Postgres `wimifarma_cotacao`.
- Evoluir a alca visual da selecao para drag-fill real se a equipe precisar copiar padroes como no Sheets.

### Miauby generativo com skills controladas

Estado:

- Miauby ja possui OpenAI, tools controladas, memoria, alertas e padroes.
- `miauw_skill_registry()` foi criado para inventariar skills por modulo, nivel, risco, permissao, executor e auditoria.
- Contador de alertas e busca de conhecimentos foram otimizados em 2026-05-11 para reduzir carga repetida.
- Alertas de encomenda da Cotacao foram ajustados para aparecerem so depois de mais de 1 dia, com comentario curto nos baloes do widget.
- A evolucao generativa ainda precisa de logs estruturados de execucao, testes de intents e tela de revisao de memorias/padroes.

Risco:

- Autonomia sem schema, permissao e auditoria pode gravar dados errados ou aprender padroes ruins.

Evolucao:

- Seguir `docs/18-miauby-evolucao-generativa.md` antes de criar novas tools generativas.
- Criar testes para confirmar que skills de escrita recusam dados incompletos ou ambiguidade.

### Migracoes de banco versionadas

Estado:

- Modulos usam funcoes `*_ensure_schema()` para criar/ajustar tabelas.

Risco:

- Alteracoes automaticas dificultam rollback e auditoria.

Evolucao:

- Criar tabela de migracoes e scripts versionados.

### Autenticacao e permissoes

Estado:

- Modulos compartilham helpers de sessao e usuario.
- Perfis existem em `wf_users.role`.
- Alguns fluxos legados ainda precisam endurecimento.

Risco:

- Mudancas em login podem afetar todos os modulos.

Evolucao:

- Mapear permissoes por modulo e remover fallbacks inseguros.

### Performance do WordPress

Estado:

- WordPress ficou lento localmente no Docker Desktop Windows.
- Plugins e caches restaurados do HostGator sao suspeitos.
- SpeedyCache/`advanced-cache.php` pode esconder mudancas de HTTPS e servir HTML antigo da home.

Risco:

- A lentidao pode reaparecer no VPS Linux.
- Reativar page cache antes da hora pode quebrar novamente apenas a home publica.

Evolucao:

- Medir tempos no VPS, revisar plugins/cache/tema, ativar cache apenas depois de HTTPS correto.
- Criar procedimento seguro para limpar e reativar SpeedyCache quando a migracao estabilizar.

## Baixa prioridade

### Testes automatizados

Estado:

- Validacao atual e principalmente manual/curl/php lint.

Evolucao:

- Criar smoke tests para login/status e testes de integridade de banco.

### Documentar APIs endpoint por endpoint

Estado:

- Existem APIs em `apps/cotacao/src/server.js`, `site/miauw/api.php`, `site/cashback/api-clientes.php` e outras.

Evolucao:

- Criar `docs/apis/` ou `docs/20-apis.md` quando a superficie estabilizar.

### Backups automaticos

Estado:

- Backups antigos foram movidos para fora da raiz do projeto.

Evolucao:

- Criar backup agendado do MySQL e politica de retencao.

## Regras para tratar pendencias

- Antes de implementar, confirmar se a pendencia ainda existe.
- Resolver uma pendencia por vez quando possivel.
- Atualizar este arquivo ao concluir, dividir ou descobrir novos riscos.
- Registrar decisoes em `docs/07-historico-de-decisoes.md`.
