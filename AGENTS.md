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
9. Quando houver alteracao de arquivos, fazer commit e push por padrao e, quando houver deploy aplicavel, enviar para o VPS tambem. So deixar sem commit/deploy se o usuario pedir explicitamente para nao publicar ou se houver bloqueio tecnico que precise ser relatado.

## Contexto atual

- Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle.
- O usuario acessa o VPS por PuTTY e os arquivos por WinSCP.
- O Codex tambem pode acessar o VPS diretamente por SSH/plink com a chave local autorizada; quando fizer deploy, deve executar os comandos no servidor e relatar o resultado, sem precisar enviar comando PuTTY equivalente ao usuario.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- O projeto local neste PC fica em `C:\Users\Thiesen\Desktop\wimifarma-com`.
- Em um computador novo, quando o usuario pedir para puxar o projeto do GitHub, o Codex deve preparar `C:\Users\Thiesen\Desktop\wimifarma-com`: se a pasta nao existir, clonar `https://github.com/WilliYY/wimifarma-com.git`; se ja existir e for Git, rodar `git fetch origin`, verificar `git status --short --branch` e so fazer `git pull --ff-only origin main` se nao houver alteracoes locais pendentes. Se houver alteracoes locais, nao sobrescrever: relatar e pedir confirmacao.
- Depois de clonar ou puxar em outro PC, antes de qualquer edicao, o Codex deve ler novamente `AGENTS.md`, `README.md` e `docs/05-comandos.md`; para tarefas especificas, ler tambem os docs relevantes. Se o usuario pediu apenas "puxe os arquivos", nao rodar build, nao alterar arquivo e nao mexer no VPS sem pedido adicional.
- Deploy automatico a partir de outro PC so funciona se o acesso SSH/plink ao VPS estiver configurado nessa maquina. Se nao houver acesso, o Codex deve fazer commit/push local quando aplicavel e informar que o deploy precisa de SSH configurado.
- No VPS, a pasta oficial do projeto e `/home/ubuntu/projetos/wimifarma-com`.
- Pastas auxiliares antigas no VPS, como clones temporarios `wimifarma-com-git`, copias `wimifarma-com-code-*` ou runtimes `wimifarma-com-runti*`, nao devem ficar misturadas na raiz de `/home/ubuntu/projetos`. Depois de confirmar que nao estao servindo containers nem guardam dados unicos, mover para uma pasta de arquivo/quarentena, por exemplo `/home/ubuntu/projetos/_arquivados-wimifarma/AAAA-MM-DD/`, preservando os dados em vez de apagar direto.
- Backups/dumps antigos foram movidos para fora do projeto local em `C:\Projetos\wimifarma-com-backups-local-20260510`.
- Trate o repositorio como publico enquanto nao houver decisao diferente; nao exponha segredos em commits.

## Stack e estrutura

- Docker Compose com `wimifarma-com-web`, `wimifarma-com-db`, `wimifarma-core-db`, `wimifarma-core-migrator`, `wimifarma-cashback-app`, `wimifarma-cashback-db`, `wimifarma-cotacao-app`, `wimifarma-cotacao-db`, `wimifarma-cotacao-redis`, `wimifarma-gestao-app`, `wimifarma-pedidos-app`, `wimifarma-tarefa-app`, `wimifarma-gestao-db`, `wimifarma-tarefa-db`, `wimifarma-xp-app`, `wimifarma-xp-db`, `wimifarma-codigos-app`, `wimifarma-codigos-db`, `wimifarma-financeiro-app`, `wimifarma-financeiro-db`, `wimifarma-usuarios-app`, `wimifarma-miauw-agent`, `wimifarma-miauw-whatsapp`, `wimifarma-miauw-whatsapp-db`, `wimifarma-miauby-db`, `wimifarma-miauby-migrator` e `wimifarma-miauby-app`.
- PHP 8.3 + Apache.
- MySQL 8.0.
- Cashback em Node.js 22 + TypeScript + Express, separado em `/cashback/`, com sessao propria, Postgres 17 dedicado para clientes, atendentes, compras, creditos, resgates, mensagens, configuracoes e auditoria.
- Cotacao V2 em Node.js 22 + Express + Socket.IO, com Postgres 17 e Redis 7.
- Gestao em Node.js 22 + TypeScript + Express, com Postgres 17 dedicado para contas, itens, pagamentos, auditoria e sessoes.
- Pedidos em Node.js 22 + TypeScript + Express, separado da Gestao em `/pedidos/`, com sessao propria e tabelas operacionais proprias no Postgres da Gestao para manter integracao financeira.
- Tarefa em Node.js 22 + TypeScript + Express, separado em `/tarefa/`, com sessao propria, Postgres 17 dedicado para tarefas/auditoria, tarefas privadas por usuario e importacao idempotente de `wf_tarefas`.
- XP em Node.js 22 + TypeScript + Express, separado em `/xp/`, com sessao propria, Postgres 17 dedicado para funcionarios, vendas, configuracoes e auditoria.
- Codigos em Node.js 22 + TypeScript + Express, separado em `/codigos/`, com sessao propria, Postgres 17 dedicado para itens, blocos EAN e auditoria.
- Financeiro em Node.js 22 + TypeScript + Express, separado em `/financeiro/`, com Postgres 17 dedicado para fechamento diario, lancamentos, sangrias, PIX, maquininhas, auditoria e migracao validada do PHP.
- Usuarios em Node.js 22 + TypeScript + Express, separado em `/usuarios/`, com sessao propria, usando o Postgres core `wimifarma_core` para usuarios, permissoes por modulo, vinculo com XP, vinculo seguro com allowlist do Miauby WhatsApp, delegacao de tarefa privada e auditoria central.
- Miauby WhatsApp em Node.js 22 + TypeScript, separado em `/miauw/whatsapp/`, com alias canonico `/miauby/whatsapp/`, painel operacional proprio, Postgres 17 dedicado para webhook, fila, dedupe, contatos mascarados/cifrados e outbox via Evolution API ou Meta Cloud API.
- Miauby interno iniciou em 2026-05-30 a migracao sombra: `apps/miauby` contem migrador e servico Node.js 22 + TypeScript, o Compose declara `wimifarma-miauby-db` com Postgres `wimifarma_miauby`, `wimifarma-miauby-migrator` no profile `migration` e `wimifarma-miauby-app` para health/status/paridade/readiness/contexto interno somente leitura. Essa fase cria/copias sanitizadas de `miauw_*` para `miauby_*` e compara amostras/checksums contra o PHP/MySQL, sem trocar widget, sem alterar frontend e sem cortar o PHP.
- Em 2026-05-31, foi iniciado o corte canonico seguro do Miauby: a home abre `Miauby` por `/miauby/`, que redireciona para `/miauw/` enquanto o chat interno ainda roda em PHP; `/miauby/agent/` e `/miauby/whatsapp/` sao aliases Apache para os servicos Node existentes. Nao remover `/miauw/`, `/miauw/agent/` nem `/miauw/whatsapp/` antes de um corte de escrita validado para `wimifarma_miauby`.
- WordPress na raiz `site/`.
- Decisao registrada em 2026-05-30: o usuario quer usar Next.js e Prisma em evolucoes futuras quando isso fizer sentido tecnico. Eles ainda nao fazem parte da stack atual do repositorio e nao devem ser introduzidos no meio de uma migracao oficial sem piloto isolado, validacao de frontend, plano de deploy, rollback e documentacao. Preferir Next.js para novo frontend/site publico ou modulo novo com experiencia rica; avaliar Prisma como ORM apenas em modulo novo ou reescrita controlada, sem misturar com os modulos Express/SQL ja estabilizados durante cortes em producao.
- Home publica da raiz `/` servida por `site/home.php` via `site/.htaccess` durante a estabilizacao da migracao; antes dos cards existe um login inicial simples com sessao propria `WFHOME`, CSRF, cookie `HttpOnly`/`SameSite=Lax`, credencial temporaria padrao `adm`/`adm` e override opcional por `WIMIFARMA_HOME_LOGIN_USER`/`WIMIFARMA_HOME_LOGIN_PASSWORD`. Em 2026-05-30, a home passou a emitir `WFHOME_SSO`, cookie assinado por `WIMIFARMA_HOME_SSO_SECRET` ou `WP_AUTH_KEY` forte, para que Cashback, Cotacao, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro, Usuarios e Miauby PHP criem suas proprias sessoes sem pedir senha novamente, sempre revalidando `core_users` ativo e a regra de role/permissao de cada modulo; sem segredo forte, os logins manuais continuam como fallback. A tela de login usa logo animada, texto `Apenas funcionarios`, anel animado, happy cat zanzando, footer liquido com bolhas integradas ao bloco, transicao suave multicolorida, logo, bloco de atendimento e botao do WhatsApp com icone solido, centralizado em telas estreitas e sem a lista antiga de modulos. Em 2026-05-30, o footer do login foi reduzido por espacamento/altura, preservando a animacao das bolhas e da cor; os tres arcos do anel do login foram ampliados em telas com espaco pelo tamanho do container, sem alterar a animacao nem o formulario. A home autenticada usa fundo visual em video em tela inteira com as cores originais, sem overlay branco de clareamento, cards inferiores elevados para abrir espaco futuro, logo animada propria sem fundo em `site/wp-content/themes/wimifarma-cashback-theme/assets/img/logo-wimifarma-home-animated.gif`, botao `Sair` e GIFs decorativos com o mesmo padrao de movimento dos logins.
- A logo oficial atual e o SVG horizontal atualizado em 2026-05-21, sincronizado em `site/cashback/logo-wimifarma.svg`, `site/financeiro/logo-wimifarma.svg`, `site/tarefa/logo-wimifarma.svg`, `site/miauw/logo-wimifarma.svg`, `apps/cotacao/public/logo-wimifarma.svg` e `site/wp-content/themes/wimifarma-cashback-theme/assets/img/logo-wimifarma*.svg`; a home publica usa o GIF animado como variacao visual da marca, sem trocar os SVGs dos modulos internos.
- Em 2026-05-31, os `favicon.svg` de Home/tema, Cotacao, Tarefa, Financeiro e Miauby foram otimizados preservando o visual original em SVG leve com PNG 64x64 embutido; nao voltar a exportacao gigante de 1 MB sem medir antes/depois e sem validar o favicon nos modulos.
- Em 2026-05-31, `site/.htaccess` e os apps Node passaram a aplicar cache forte apenas para assets estaticos de imagem/video/fonte e cache curto para CSS/JS Apache, sem cache de pagina. HTML, PHP, APIs, health checks e sessoes devem continuar sem cache agressivo; ao trocar asset publicado que precise atualizar imediatamente, usar cache-bust por query string ou novo nome.
- Em 2026-05-21, foi validado com navegador local e checks publicos que Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw carregam a logo nova tanto nas telas de login quanto nas telas internas autenticadas. O `/wp-login.php` continua sendo tela padrao do WordPress e pode mostrar o logo/cabecalho do WordPress; nao tratar isso como regressao dos modulos internos, salvo pedido explicito para customizar o login WordPress.
- A ordem dos cards da home publica deve ser `Cashback`, `Cotacao`, `Pedidos`, `Financeiro`, `Tarefas`, `Codigos`, `XP`, `Gestao`, `Miauby`, `Miauby Whatsapp` e `Usuarios`; no desktop, os dez primeiros devem formar duas fileiras de cinco cards e `Usuarios` deve ficar por ultimo na terceira fileira. Quando o login da home tiver `WFHOME_SSO` valido ou houver sessao ativa no XP/Usuarios, e o login estiver vinculado a um funcionario XP em `core_user_xp_links`, a home deve mostrar um mini-card do XP acima da grade, lendo `xp_employees`/`xp_sales` por endpoint dos apps Node, sem copiar pontos para o core. No mobile, a home publica deve manter os cards dos modulos em duas colunas compactas para mostrar mais acessos por tela; textos longos podem ser reduzidos/truncados visualmente, mas os links precisam continuar claros e tocaveis.
- Em 2026-05-29, os logins dos modulos internos foram alinhados para usar o core Postgres por padrao. Pedidos removeu fallback MySQL e usa somente `core_users`; Miauby PHP usa `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core` via `pdo_pgsql` no container web. Em 2026-05-30, Cashback, Gestao, Tarefa, Codigos, XP e Financeiro passaram a login unico em `core_users`, sem `CASHBACK_AUTH_PROVIDER`, `GESTAO_AUTH_PROVIDER`, `TAREFA_AUTH_PROVIDER`, `CODIGOS_AUTH_PROVIDER`, `XP_AUTH_PROVIDER`, `FINANCEIRO_AUTH_PROVIDER` nem fallback MySQL no codigo. Ainda em 2026-05-30, os modulos Node e o Miauby PHP passaram a aceitar handoff `WFHOME_SSO` para criar sessao propria sem redigitar senha apos a home, mantendo login manual como fallback e sem conceder acesso sem revalidar role/permissao. Rollback de autenticacao ainda existe por restauracao de versao/`.env` apenas onde documentado, mas deve ser opt-in e temporario.
- O card de Tarefas na home usa `/tarefa/badge.php` para mostrar um badge vermelho apenas com a quantidade de tarefas publicas abertas; tarefas privadas por usuario nao entram no badge para nao vazar volume individual.
- O card `Cashback` abre `/cashback/`, servido oficialmente por `apps/cashback` via proxy Apache, mantendo o frontend visual de `site/cashback` por assets montados. A fonte oficial e o Postgres `wimifarma_cashback`; em 2026-05-29 foram validados clientes, atendentes, compras, creditos, resgates, itens, settings, mensagens, saldos e sequencias contra `wf_*`. Em 2026-05-30, o caminho dormente `mysql2` foi removido do Cashback: nao ha importador, espelho, logs nem fallback de autenticacao MySQL no app; `wf_*` fica somente como referencia historica/backup, e rollback exige restaurar commit/imagem anterior.
- O card `Gestao` abre o modulo administrativo em `/gestao/`, servido oficialmente por `apps/gestao` via proxy Apache, restrito a `adm`, `admin` ou `gerente`, com contas a pagar manuais, pagamentos parciais, total pago por mes, lista compacta de contas abertas e painel `Mensal` lateral para contas com repeticao ativa e ordem manual por arrastar.
- O card `Pedidos` abre `/pedidos/`, servido oficialmente por `apps/pedidos` via proxy Apache, separado visual e estruturalmente da Gestao. A URL antiga `/gestao/pedidos` redireciona para `/pedidos/` apenas por compatibilidade.
- O card `Tarefas` abre `/tarefa/`, servido oficialmente por `apps/tarefa` via proxy Apache, preservando a mesma interface visual do modulo antigo. A fonte oficial de tarefas e `tarefa_tasks` no Postgres `wimifarma_tarefa`; tarefas comuns ficam com `assigned_core_user_id IS NULL` e aparecem para todos, enquanto tarefas privadas criadas pelo painel Usuarios usam `assigned_core_user_id` e aparecem somente para o login delegado. Desde 2026-05-30, Tarefa nao possui `mysql2`, importador, espelho de logs, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` nem flags `TAREFA_LEGACY_MYSQL_*`; `wf_tarefas` fica apenas como referencia historica/rollback por restauracao de versao anterior e backup.
- O card `Usuarios` abre `/usuarios/`, servido oficialmente por `apps/usuarios` via proxy Apache, restrito a username `adm` ou role `admin`, para criar/desativar logins internos, escolher modulos liberados, vincular o login a funcionario do XP, delegar tarefa privada no app Tarefa, vincular/remover numeros da allowlist do Miauby WhatsApp, consultar a senha definida pelo ADM no cofre cifrado e ver historico central. Cada card de usuario mostra um historico proprio minimizado por padrao, reunindo acoes feitas pelo login e alteracoes recebidas nele; o historico geral da lateral tambem fica minimizado para nao poluir a tela. O core guarda apenas `contact_id`, mascara, status e cards do WhatsApp em `core_user_whatsapp_links`; telefone cru fica cifrado no bridge WhatsApp.
- O card `XP` abre `/xp/`, servido oficialmente por `apps/xp` via proxy Apache, com gamificacao dos atendentes por vendas lancadas manualmente, cadastro de funcionarios, upload validado de foto, trilha horizontal em zigue-zague, progressao infinita de niveis e renderizacao em janela curta: niveis 1 a 20 no inicio e, depois disso, uma janela ao redor do nivel mais alto para preservar performance. Na aba `Configuracoes`, os cards de funcionarios devem mostrar barra amarela preenchida conforme o percentual real do nivel; na faixa inferior da `Trilha`, cada jogador tambem deve mostrar progresso amarelo proporcional; `Ultimos lancamentos` deve mostrar a observacao salva no lancamento e uma barra amarela compacta com o XP do lancamento.
- Em 2026-05-31, o asset comum da trilha do XP (`site/xp/assets/bloco-xp.svg`) foi otimizado preservando a arte original do bloco: saiu a exportacao base64 gigante e entrou um PNG transparente otimizado embutido no mesmo SVG/rota, com cache-bust atualizado em `apps/xp/src/server.ts`; nao voltar a usar exportacao base64 pesada sem medir antes/depois.
- Em 2026-05-28, o XP foi cortado para `apps/xp` em Node.js 22 + TypeScript + Postgres `wimifarma_xp`, mantendo o mesmo frontend visual por `site/xp/styles.css`, `site/xp/app.js`, `site/xp/login-runner.js`, `site/xp/assets` e uploads compartilhados em `site/xp/uploads`. A fonte oficial passa a ser `xp_employees`, `xp_sales`, `xp_settings` e `xp_audit_events`; `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings` ficam apenas como referencia historica/backup. Desde 2026-05-30, XP nao possui `mysql2`, importador, espelho, logs, fallback `wf_users`, `XP_AUTH_PROVIDER` nem flags `XP_LEGACY_MYSQL_*`; rollback exige restaurar versao anterior e backup validado.
- Em 2026-05-28, Codigos foi cortado para `apps/codigos` em Node.js 22 + TypeScript + Postgres `wimifarma_codigos`, mantendo o mesmo frontend visual por `site/codigos/styles.css`, `site/codigos/app.js` e `site/codigos/login-runner.js`. A fonte oficial passa a ser `codigos_items`, `codigos_groups` e `codigos_audit_events`; `wf_codigos_comissao` e `wf_codigos_blocos` ficam apenas como referencia historica/backup. Desde 2026-05-30, Codigos nao possui `mysql2`, importador, espelho, logs, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` nem flags `CODIGOS_LEGACY_MYSQL_*`; rollback exige restaurar versao anterior e backup validado. O Miauby consulta Codigos por endpoints internos tokenizados do app Node (`/codigos/api/internal/summary` e `/codigos/api/internal/search`) quando `CODIGOS_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` existe.
- Em 2026-05-29, a limpeza de legado arquivou somente itens comprovadamente fora das rotas oficiais em `site/_legacy-disabled/2026-05-29/`, protegido por `.htaccess`: `site/gestao`, PHP antigo de `site/codigos`, PHP antigo de `site/xp` e financeiro antigo dentro de `site/cashback`. Nao apagar essa quarentena sem confirmacao. Continuam ativos WordPress, `site/miauw`, `site/cashback/config.php`, `site/cashback/functions.php`, `site/financeiro/financeiro-funcoes.php`, `site/tarefa` e todos os assets montados pelos apps Node. Em 2026-05-31, `site/cashback/.htaccess`, `site/financeiro/.htaccess` e `site/tarefa/.htaccess` passaram a bloquear execucao web direta de PHP nesses legados, preservando assets e includes por filesystem; se o proxy oficial cair, diagnosticar o app Node/Postgres em vez de deixar o PHP antigo ressurgir. O inventario fica em `docs/27-limpeza-legado.md`.
- Em 2026-05-28, o Financeiro ganhou sombra em `apps/financeiro` com Node.js 22 + TypeScript + Postgres `wimifarma_financeiro`, importando idempotentemente `financeiro_fechamentos`, `financeiro_lancamentos`, `financeiro_sangrias`, `financeiro_maquininhas`, `financeiro_pix`, `financeiro_configuracoes` e `financeiro_auditoria` para health, resumo e checksums internos tokenizados.
- Em 2026-05-29, o Financeiro foi cortado para `apps/financeiro` como rota oficial `/financeiro/` via proxy Apache para `wimifarma-financeiro-app:3800/financeiro`, preservando o frontend visual de `site/financeiro` por assets montados, login unico em `core_users`, sessao `WFFINANCEIRO`, Postgres `wimifarma_financeiro` como fonte de verdade e endpoints internos tokenizados para Miauby/WhatsApp. A paridade com MySQL foi validada em contagens, somatorios em centavos, categorias, amostras por dia, CSV, rotas autenticadas e dry-run n8n; em 2026-05-30 o caminho dormente `mysql2` foi removido: nao ha importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` nem flags `FINANCEIRO_LEGACY_MYSQL_*` no runtime. MySQL `financeiro_*` fica somente como referencia historica/backup, e rollback exige restaurar versao/imagem anterior e backup validado.
- Em 2026-05-25, o login do XP foi simplificado para mostrar apenas a logo oficial, o titulo `Entrar no XP`, a descricao e o formulario; o selo textual amarelo `Wimifarma XP` foi removido e nao deve voltar sem pedido explicito.
- O Miauby conhece o contexto do XP e pode usar "farmar aura no XP" como linguagem interna de jogo para incentivar venda real e lancamento correto, sem inventar ranking, nivel ou pontuacao quando nao houver dado vindo do sistema ou do usuario.
- Em 2026-05-26, o Miauby WhatsApp iniciou como backend dedicado em `apps/miauw-whatsapp`, com Node.js 22 + TypeScript e Postgres 17 proprio para webhook, fila, dedupe, allowlist, painel operacional e outbox. O transporte pode ser `evolution` ou `meta` por `MIAUW_WHATSAPP_PROVIDER`; Evolution e Meta Cloud API devem ser apenas transporte por webhook/API, enquanto permissoes, guardrails, fila e auditoria ficam no bridge/Miauby. O modo de IA do WhatsApp e controlado por `MIAUW_WHATSAPP_AI_MODE=miauw|gemini|hybrid`: `miauw` usa o core interno/OpenAI, `gemini` usa Gemini para conversa curta sem comandos, e `hybrid` envia conversa simples ao Gemini quando `GEMINI_API_KEY` existe, mas roteia comandos internos para o core Miauby. O repositorio continua com default seguro `MIAUW_WHATSAPP_ENABLED=false`, mas o VPS pode ativar o canal por `.env` quando token/cifragem estiverem configurados. O painel `/miauw/whatsapp/` pode ser protegido por `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`, usa favicon proprio do Miauby e deve manter `/miauw/whatsapp/health` publico sem segredo. Grupos ficam bloqueados por padrao, o canal usa anti-flood por remetente e global, intervalo minimo entre envios e pausa em erro temporario do transporte; acoes fortes seguem sujeitas a confirmacao/auditoria. O numero do Cashback (`+55 44 99739-4711`) pode ser usado em teste quando controlado pela empresa, mas remetentes autorizados devem entrar em allowlist.
- Em 2026-05-27, o Miauby WhatsApp ganhou roteador hibrido mais rapido: respostas locais para `oi`/`teste`/`status`/`ajuda`, cache curto de Gemini por `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS`, consultas internas roteadas ao core como leitura, bloqueio local de escrita forte/dado sensivel antes de IA e telemetria de `reply_engine`, `route_reason` e `reply_latency_ms` na outbox/painel.
- Em 2026-05-27, o painel `/miauw/whatsapp/` passou a permitir autorizar/bloquear remetentes da allowlist pelo Postgres, mantendo `MIAUW_WHATSAPP_ALLOWED_SENDERS` como allowlist fixa por ambiente. O webhook consulta bloqueios/autorizações do Postgres e depois a allowlist do `.env`. O painel tambem mostra a demora total da resposta em 24h, do recebimento do evento ate o envio pelo transporte, separada da latencia da IA.
- Em 2026-05-27, o painel `/miauw/whatsapp/` tambem passou a editar nome/numero de contatos, liberar cards/modulos por numero autorizado, mostrar sincronia recente entre mensagem recebida e resposta enviada e registrar erros abertos em tabela propria para correcao futura. A tela deve continuar sem exibir payload bruto ou segredo; telefone completo pode aparecer na edicao da allowlist logada e na Sincronia recente logada para conferir o remetente resolvido. `miauby menu` mostra apenas os cards liberados para aquele hash de telefone.
- Em 2026-05-27, os contatos ja cadastrados da allowlist passaram a abrir minimizados no painel; o core WhatsApp bloqueia chamada de tool quando o card detectado nao esta liberado para o telefone, e o painel mostra grafico simples de media/p95 por motor de resposta. Erros abertos podem ser marcados como resolvidos pelo painel apos correcao.
- Em 2026-05-27, o avatar/foto atual do Miauby passou a ser `site/miauw/miauby-novo.jpeg`, usado pelo chat interno, widget e login do painel WhatsApp. O bridge WhatsApp passou a comparar numeros brasileiros com equivalencia de DDI `55` e nono digito movel, para aceitar o mesmo remetente com ou sem o `9` depois do DDD. Remetente fora da allowlist nao chama IA/core/tools; o evento fica `ignored/sender_not_allowed` e o bridge pode responder um aviso curto dizendo que o Miauby e interno e so atende numeros permitidos. O painel logado pode mostrar telefone completo na edicao da allowlist e na Sincronia recente para correcao operacional; health/status/logs continuam sem payload bruto, segredo ou telefone completo.
- Em 2026-05-29, o enquadramento visual de `site/miauw/miauby-novo.jpeg` foi ajustado por CSS no chat interno, widget global e login do painel WhatsApp para preencher melhor os avatares circulares, sem trocar a imagem-fonte.
- Em 2026-05-27, a allowlist do Miauby WhatsApp passou a aceitar formatos soltos como `44997641531`, `44 99764 1531`, `997641531` ou `97641531`. Numeros locais de 8/9 digitos usam `MIAUW_WHATSAPP_DEFAULT_DDD=44` por padrao, geram variantes com/sem DDI `55` e com/sem nono digito, e sufixo so pode participar de comparacao quando tiver pelo menos 8 digitos para evitar liberacao ampla acidental.
- Em 2026-05-27, o VPS oficial do Miauby WhatsApp passou a operar com `MIAUW_WHATSAPP_REQUIRE_PREFIX=false` para remetentes em allowlist. Conversa solta sem comando vai ao Gemini com personalidade/instrucoes seguras; comandos operacionais detectados, como `sangria 10 Will`, podem ir ao core/tools quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, sempre passando por card liberado, pendencia e confirmacao `Sim`/`Nao`. Mensagens com `miauby` em qualquer posicao continuam acionando o core Miauby/API com tools e guardrails; escritas fortes nunca devem virar texto solto executavel.
- Em 2026-05-27, o prompt Gemini do Miauby WhatsApp foi reforcado no codigo para manter identidade/persona do Miauby, nao inventar dados operacionais e orientar uso de `miauby` para core; Gemini 2.5 usa `MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET=0` e max output maior para evitar respostas cortadas como `Nosso horario e`.
- Em 2026-05-29, o Miauby WhatsApp deixou saudacoes simples (`oi`, `teste`, `status`, `ajuda`) ainda mais curtas e passou a bloquear localmente pedidos claramente fora do Miauby, como receita/bolo, antes de gastar Gemini. O prompt Gemini agora reaproveita de forma curta e sanitizada a personalidade, perfil de voz, padroes e treino aprovado exportados por `site/miauw/agent-context.php`, mas continua sem receber contrato de tools no caminho de conversa solta e sem poder inventar dado operacional.
- Em 2026-05-29, o `.htaccess` da raiz manteve redirecionamento HTTPS publico, mas passou a isentar o hostname interno Docker `wimifarma-com-web`; endpoints internos tokenizados como `agent-context.php`, `agent-actions.php` e rotas de smoke/watchdog devem ser chamados por HTTP dentro da rede Docker sem redirecionar para porta 443 inexistente no container web.
- Em 2026-05-27, o Miauby WhatsApp passou a buscar o mesmo pacote de contexto do Miauby interno por `site/miauw/agent-context.php`, endpoint interno tokenizado que exporta `style_context`, treino aprovado, perfil de voz e contratos de tools do PHP. Assim, mensagens com `miauby` usam o mesmo treino/perfil/tools do chat interno. Ainda em 2026-05-27, o WhatsApp ganhou `site/miauw/agent-actions.php` para preparar acoes fortes permitidas, guardar pendencia curta no Postgres do bridge e enviar confirmacao `Sim`/`Nao` por botoes interativos quando o transporte permitir. A execucao confirmada por WhatsApp fica desligada por padrao no Git (`MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=false`) e so deve ser ligada em ambiente com allowlist, token interno, auditoria e lista de tools permitidas; sem pendencia valida, texto solto `sim/nao` nao executa nada.
- Em 2026-05-27, o Miauby WhatsApp ganhou suporte opcional a audio: `MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED=true` permite baixar audio autorizado do transporte apenas no worker, transcrever com Gemini e descartar os bytes; `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=true` permite gerar resposta falada por Gemini TTS, com fallback para texto se o envio de audio falhar. O prompt TTS usa `MIAUW_WHATSAPP_AUDIO_TTS_STYLE` para uma voz humana clara com leve jeito de gato/Miauby, sem clonagem de voz. O Git mantem audio desligado por padrao, o Postgres guarda apenas metadados sanitizados/transcricao e confirmacoes continuam por botoes/texto.
- Ainda em 2026-05-27, o padrao do TTS do WhatsApp passou para `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr` com estilo mais agudo/brilhante e levemente felino, sem imitar voz real. Para numeros brasileiros, o bridge continua normalizando DDI `55` por padrao; quando a Evolution entregar `@lid` em vez do telefone, mapear o LID para o telefone real autorizado em `MIAUW_WHATSAPP_RECIPIENT_ALIASES` no `.env` do VPS, sem versionar. As permissoes/cards do WhatsApp devem considerar tanto o identificador recebido quanto o telefone alias-resolvido, para que comandos internos usem a mesma allowlist do contato real.
- Em 2026-05-27, o Miauby WhatsApp ganhou leitura opcional de comprovante Pix por midia: `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true` baixa foto, print, imagem encaminhada ou PDF/documento autorizado apenas no worker, extrai campos com Gemini, valida o destino por CNPJ/chave Pix `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ` (padrao `07676534000181`) ou nome correlato em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES`, e prepara lancamento `Pix CNPJ` no Financeiro com confirmacao `Sim`/`Nao`. A midia bruta nao e persistida; o Postgres guarda somente metadados sanitizados, resultado de extracao e pendencia. Erros transitorios de OCR tentam retry antes de responder falha ao usuario. Grupos continuam bloqueados por padrao e o contato precisa ter card `Financeiro` liberado antes de chamar OCR/Gemini. Em 2026-05-29, a leitura passou a usar legenda/nome do arquivo como pista, reforcar a extracao de valor pago contra saldo/tarifa/limite e aceitar fallback deterministico de valor/data/hora a partir do texto OCR compacto. A correcao manual aceita `pix cnpj valor - nome - obs opcional` e tambem tolera o typo `pix cpnj`; se data/hora nao vierem, usa o momento atual.
- Em 2026-05-30, confirmacoes do WhatsApp via Evolution foram travadas em texto simples, porque `sendButtons` pode retornar sucesso na Baileys mas aparecer no WhatsApp Web como mensagem que nao carrega. Meta Cloud API pode continuar usando botoes interativos; `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS` fica apenas como sinal diagnostico legado e nao ativa botoes na Evolution. O texto de confirmacao nao deve expor codigo curto ao usuario; `SIM`/`NAO` ou clique em botao Meta resolve pela pendencia ativa do remetente autorizado, mesmo quando `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`.
- Em 2026-05-27, o Miauby WhatsApp voltou a responder localmente saudacoes como `oi`, `ola`, `teste` e `status` sem gastar Gemini/core, reduzindo latencia. Respostas faladas repetidas usam cache curto por `MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS`. O painel tambem passou a mostrar bloco `n8n automacoes`, com rotinas planejadas e destino calculado pelos cards liberados na allowlist.
- Em 2026-05-27, LIDs da Evolution configurados em `MIAUW_WHATSAPP_RECIPIENT_ALIASES` passaram a ficar ocultos/protegidos na allowlist editavel do painel WhatsApp: nao podem ser editados, bloqueados ou reautorizados pelo painel, e nao entram como destinatarios calculados para rotinas n8n. O operador deve editar apenas o telefone real vinculado.
- Em 2026-05-29, o bridge do Miauby WhatsApp passou a canonizar novas mensagens pelo telefone real quando `MIAUW_WHATSAPP_RECIPIENT_ALIASES` resolve um LID da Evolution, e a Sincronia recente do painel logado passou a exibir o numero completo resolvido para evitar confusao entre final do LID e final do telefone real.
- Em 2026-05-29, o envio de resposta do Miauby WhatsApp foi ajustado para manter permissoes, painel e auditoria no telefone real resolvido, mas responder pelo endereco original do chat quando a Evolution entregar `@lid` configurado em `MIAUW_WHATSAPP_RECIPIENT_ALIASES`. Isso evita resposta marcada como `sent` pela Evolution aparecer fora do chat que enviou `oi`/mensagens simples.
- Em 2026-05-27, o Miauby WhatsApp passou a expor endpoints internos tokenizados para n8n/pos-deploy: `POST /miauw/whatsapp/internal/smoke-check` verifica bridge, proxy Apache, core Miauby, Gestao, Pedidos, Cotacao, widget e Evolution; `POST /miauw/whatsapp/internal/watchdog` monitora fila, outbox, provider pausado, respostas lentas, envios `sent` sem id e conversas que parecem travadas depois de `sent`. Ambos aceitam `notify=never|problems|always`, enviam apenas para contatos reais com card `Miauby`, ignoram LIDs protegidos e usam cooldown por `MIAUW_WHATSAPP_AUTOMATION_NOTIFY_COOLDOWN_MINUTES`.
- Em 2026-05-29, o Miauby WhatsApp ganhou a rotina n8n `Chegada de pedidos`: `POST /miauw/whatsapp/internal/pedidos-arrival-check` deve ser chamado pelo n8n todo dia as 17h com `notify=always`, consulta Pedidos por endpoint interno tokenizado, envia a lista de `Aguardando chegada` apenas para contatos reais com card `Pedidos` e aparece no painel `/miauw/whatsapp/` com botao para ativar/desativar. Respostas como `cimed chegou` sao tratadas deterministicamente pelo bridge, exigem card `Pedidos`, chamam `POST /pedidos/api/internal/confirm-arrival` e movem somente a chegada para `Confirmados`/`Historico`; pagamento continua no fluxo normal de Pedidos.
- Em 2026-05-29, o Miauby WhatsApp ganhou a rotina n8n `Fechamento de caixa`: `POST /miauw/whatsapp/internal/financeiro-cash-closing-reminder` deve ser chamado pelo n8n todo dia as 18h com `notify=always`, consulta `GET /financeiro/api/internal/cash-closing-status` e envia lembrete com frase variada apenas para contatos reais com card `Financeiro` quando o caixa do dia ainda nao estiver fechado. Se o Financeiro retornar `fechado`, `divergente` ou `sem_movimento`, o bridge nao envia nada. A rotina aparece no painel `/miauw/whatsapp/` com botao para ativar/desativar.
- Em 2026-05-28, o worker do Miauby WhatsApp ganhou recuperacao de outbox: pendencias `pending` recentes sao reenviadas em lote pequeno por `MIAUW_WHATSAPP_OUTBOX_RECOVERY_BATCH_SIZE`, `sending` travado volta para `pending`, e pendencias mais antigas que `MIAUW_WHATSAPP_OUTBOX_RECOVERY_MAX_AGE_MINUTES` viram `dead` para nao disparar mensagens velhas depois de queda/redeploy.
- Em 2026-05-30, o painel do Miauby WhatsApp passou a excluir `outbox dead` com `error_summary='stale_pending_expired'` do contador visual `Problemas`; essas linhas continuam no historico/auditoria, mas representam expiracao segura de pendencia antiga, nao falha operacional atual. A lista de `Erros abertos` tambem ignora avisos de recuperacao segura de outbox antigo e avisos transitorios `queue_event` quando o evento ja terminou como `replied`; o worker resolve automaticamente esses avisos de fila quando a tentativa posterior responde com sucesso.
- Em 2026-05-29, o worker do Miauby WhatsApp foi ajustado para nao ficar preso durante pausa longa do provedor: quando `provider_paused` esta ativo, o envio falha rapido, volta para retry com backoff e evita duplicidade por recuperacao de `processing/sending`. O smoke-check interno do n8n passou a rodar checks HTTP/Evolution em paralelo, e o watchdog passou a considerar `next_attempt_at` para nao alertar como travado o que esta apenas aguardando retry normal.
- Em 2026-05-28, o Miauby interno e o Miauby WhatsApp passaram a compartilhar memoria curta com fonte principal no Postgres do bridge, pela tabela `miauw_whatsapp_channel_events` e endpoint interno tokenizado `POST /miauw/whatsapp/internal/memory`. O PHP usa essa ponte por `MIAUW_CHANNEL_MEMORY_BRIDGE_URL`; se ela estiver indisponivel, cai para compatibilidade MySQL em `site/miauw/agent-memory.php`/`miauw_channel_events`. O chat interno grava entradas/saidas sanitizadas, o worker WhatsApp grava cada resposta enviada sem bloquear a fila, e `site/miauw/agent-context.php` exporta `channel_memory` junto do treino/perfil/tools. Essa memoria usa hash/mascara do contato, texto resumido e metadados limpos; nao guardar telefone cru, payload bruto, audio, midia ou segredo.
- O n8n foi adotado como camada de automacao/orquestracao, nao como backend de regras. O template operacional fica em `ops/n8n/`, com Postgres proprio e volumes ignorados pelo Git. Fluxos n8n devem chamar endpoints internos tokenizados; escrita forte continua no backend/Miauby com confirmacao e auditoria. O plano de rotinas fica em `docs/23-n8n-automacoes.md`.
- O workflow versionado `ops/n8n/workflows/pedidos-chegada-17h.json` agenda a rotina diaria de chegada dos pedidos as 17h e chama o endpoint interno do Miauby WhatsApp. Ele usa `WIMIFARMA_INTERNAL_BASE_URL` e `MIAUW_GUARDIAN_TOKEN` no ambiente do n8n; nunca gravar token dentro do JSON.
- O workflow versionado `ops/n8n/workflows/financeiro-fechamento-caixa-18h.json` agenda o lembrete diario de fechamento do caixa as 18h e chama o endpoint interno do Miauby WhatsApp. Ele usa `WIMIFARMA_INTERNAL_BASE_URL` e `MIAUW_GUARDIAN_TOKEN` no ambiente do n8n; nunca gravar token dentro do JSON.
- Em 2026-05-27, o container web passou a redefinir o LogFormat `combined` sem query string (`%m %U %H`) para evitar que tokens de webhook em URL aparecam no access log.
- A Evolution API do Miauby WhatsApp tem template operacional em `ops/evolution/` e, no VPS, deve rodar separada em `/home/ubuntu/projetos/wimifarma-evolution-api`, com containers `wimifarma-evolution-api`, `wimifarma-evolution-postgres` e `wimifarma-evolution-redis`. A API fica publicada apenas em `127.0.0.1:8080` e conectada internamente na rede `wimifarma-com-network`; o bridge deve usar `EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080`. Quando precisar de manager, usar o manager embutido em `http://127.0.0.1:8080/manager` via acesso local/tunel, sem container manager separado. Para reduzir erro de QR/codigo de pareamento na Evolution/Baileys, manter cache local, historico/contatos/chats/labels desligados e `CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198`.
- Em 2026-05-30, timeouts pontuais do Baileys em `executeInitQueries`/`fetchProps` foram tratados como monitoramento operacional, nao como motivo para upgrade/recriacao da Evolution quando `connectionState=open` e `MESSAGES_UPSERT` continua chegando. O script `ops/evolution/check-baileys-init-timeouts.sh` confere container, conexao e quantidade de timeouts recentes sem expor segredo; `status=critical` deve acionar investigacao e, se o webhook travar, restart apenas de `wimifarma-evolution-api`.
- Em 2026-05-27, a Evolution API v2.3.0 foi validada no VPS com a instancia `wimifarma-business-no9-20260526190040` conectada (`open`) e webhook configurado para `/miauw/whatsapp/webhook` com eventos `QRCODE_UPDATED`, `CONNECTION_UPDATE` e `MESSAGES_UPSERT`; `EVOLUTION_API_INSTANCE` do projeto principal deve apontar para essa instancia enquanto ela for a oficial.
- Quando a Evolution/Baileys entregar remetente como LID/identificador longo em vez de telefone E.164, o bridge WhatsApp pode usar `MIAUW_WHATSAPP_RECIPIENT_ALIASES` no `.env` do VPS para mapear identificador recebido para telefone real autorizado; esse mapeamento nunca deve ir para o Git. O roteamento de cards deve consultar tambem o telefone resolvido pelo alias.
- Em 2026-05-24, foi aplicado hardening sem troca de segredos: logins PHP ganharam limitador persistente, originalmente em `wf_login_rate_limits` e depois migrado para `core_login_rate_limits` quando `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`, alem do bloqueio por sessao; Cotacao V2 ganhou limitador de login e headers de seguranca, `xmlrpc.php` foi bloqueado por `.htaccess`, uploads versionados bloqueiam execucao de scripts e `scripts/check-secrets.ps1` virou a rotina local de varredura de segredos antes de push.
- Em 2026-05-31, a home `/`, Codigos, Financeiro e o painel `/miauw/whatsapp/` foram alinhados ao baseline de headers de seguranca: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` e `Strict-Transport-Security` em HTTPS. A CSP da home e do painel WhatsApp preserva `unsafe-inline` por causa dos templates atuais com CSS/JS embutidos; novas telas devem reduzir inline antes de apertar a politica.
- Em 2026-05-31, as dependencias de producao de `apps/cotacao` e `apps/miauw-agent` foram atualizadas para eliminar vulnerabilidades moderadas de `qs`, `ws`, `engine.io`, `socket.io-adapter` e cadeia `googleapis`. A Cotacao usa `fetch` direto para Google Sheets; nao reintroduzir `googleapis` sem uso real no codigo, validacao e audit limpo.
- Em 2026-05-24, a home publica passou a usar a logo em GIF animado fornecida pelo usuario, com fundo transparente e sem sobrepor o SVG antigo; os outros modulos continuam usando o SVG oficial.
- Pedidos controla fornecedores, chegada, vencimento de boleto por parcela, pagamentos parciais/totais, edicao auditada e historico em duas tabelas operacionais: `pedidos_orders` para pedidos registrados/aguardando chegada e `pedidos_confirmed_orders` para confirmados e historico. Na criacao, a previsao de chegada e digitada como numero de dias e gravada como data calculada em `expected_arrival_at`.
- O formulario de novo pedido deve continuar organizado visualmente por blocos de fornecedor, parcelas, entrega, status inicial e observacao, com o total destacado no cabecalho, sem alterar a ordem dos campos nem as regras de criacao.
- Pagamentos de Pedidos alimentam automaticamente a categoria `Boleto` da Gestao por `gestao_accounts`, `gestao_account_items` e `gestao_account_payments`. Pedidos e Gestao sao modulos distintos; novas telas/cards com dominio proprio devem ter rota/app proprios em vez de virar subview de Gestao.
- Contas vinculadas a `Pedidos` devem permanecer na categoria `Boleto`; a recategorizacao em lote e bloqueada quando a categoria contem pedidos, e cancelamento/reabertura/pagamento da conta sincroniza o status do pedido vinculado.
- Ao criar um novo card/modulo, decidir primeiro o melhor desenho tecnico para aquele dominio: linguagem/runtime, banco, tabelas, indices, sessoes, permissao, auditoria, health e deploy. Nao misturar em modulo existente apenas por conveniencia visual; se o card tiver regra de negocio propria, ele deve nascer com estrutura propria e integracoes explicitas.
- Modulos internos PHP puro:
  - `site/miauw`, com dados/treino/conversas ainda em MySQL, mas login interno compartilhado pelo core Postgres do Cashback.
- A rota `/cashback/` e servida por proxy interno do Apache para `wimifarma-cashback-app:4000/cashback`; `site/cashback` fica como assets/helpers PHP para includes do Miauby, com execucao web direta de PHP bloqueada por `.htaccess`, e nao e fallback operacional da tela apos o corte.
- A rota `/cotacao/` e servida por proxy interno do Apache para `wimifarma-cotacao-app:3000`; a Cotacao PHP antiga em `site/cotacao` foi removida e os ativos usados pela V2 ficam em `apps/cotacao/public`.
- A rota `/gestao/` e servida por proxy interno do Apache para `wimifarma-gestao-app:3200/gestao`; o legado PHP de `site/gestao` foi arquivado em `site/_legacy-disabled/2026-05-29/gestao` e nao e fonte oficial da tela.
- A rota `/pedidos/` e servida por proxy interno do Apache para `wimifarma-pedidos-app:3300/pedidos`; Pedidos nao deve voltar a ser implementado dentro de `/gestao/`.
- A rota `/tarefa/` e servida por proxy interno do Apache para `wimifarma-tarefa-app:3500/tarefa`; `site/tarefa` fica como legado de referencia/fonte visual, com execucao web direta de PHP bloqueada por `.htaccess`, e nao e fallback operacional da tela apos o corte.
- A rota `/miauw/agent/` e servida por proxy interno do Apache para `wimifarma-miauw-agent:3100/miauw/agent`; ela pode rodar em sombra ou corte controlado por `MIAUW_ENGINE`, enquanto o PHP preserva login, sessoes, confirmacoes e escrita forte.
- A rota `/miauw/whatsapp/` e servida por proxy interno do Apache para `wimifarma-miauw-whatsapp:3400/miauw/whatsapp`; a home publica possui o card `Miauby Whatsapp` apontando para esse painel operacional.
- A rota `/codigos/` e servida por proxy interno do Apache para `wimifarma-codigos-app:3700/codigos`; `site/codigos` fica somente como fonte visual dos assets, e o PHP antigo esta em `site/_legacy-disabled/2026-05-29/codigos-php`.
- A rota `/financeiro/` e servida por proxy interno do Apache para `wimifarma-financeiro-app:3800/financeiro`; `site/financeiro` fica como assets/helper PHP para includes do Miauby, com execucao web direta de PHP bloqueada por `.htaccess`, e nao e fallback operacional da tela apos o corte.
- A rota `/usuarios/` e servida por proxy interno do Apache para `wimifarma-usuarios-app:3900/usuarios`; a fonte oficial fica no Postgres core `wimifarma_core`.
- Banco WordPress: `wimifarma_wp`, prefixo `wptl_`.
- Banco dos apps: `wimifarma_app`.
- Banco core compartilhado: Postgres `wimifarma_core`, com dados persistidos em `core-data/postgres`; guarda `core_users`, `core_audit_logs`, `core_login_rate_limits`, `core_user_module_permissions`, `core_user_xp_links`, `core_user_admin_passwords`, `core_user_whatsapp_links`, `core_user_audit_events` e sessoes `usuarios_sessions`. `apps/core-auth` sincroniza `wf_users` para `core_users`; `apps/usuarios` cria novos logins core com `legacy_mysql_id` negativo para nao conflitar com ids antigos. Senhas antigas importadas por hash nao sao recuperaveis; novas senhas criadas/trocadas pelo ADM ficam cifradas em `core_user_admin_passwords`, com chave em `USUARIOS_PASSWORD_VAULT_KEY` ou fallback para `USUARIOS_SESSION_SECRET`.
- Banco do Cashback: Postgres `wimifarma_cashback`, com dados persistidos em `cashback-data/postgres`; guarda `cashback_attendants`, `cashback_clients`, `cashback_purchases`, `cashback_credits`, `cashback_redemptions`, `cashback_redemption_items`, `cashback_settings`, `cashback_whatsapp_messages`, `cashback_audit_events`, `cashback_migration_runs` e sessoes `cashback_sessions`. MySQL `wf_*` relacionado ao Cashback nao e mais dependencia ativa desde 2026-05-30; o app nao possui `mysql2`, importador, espelho ou fallback de auth. Rollback MySQL do Cashback exige restaurar versao anterior e backup.
- Banco do XP: Postgres `wimifarma_xp`, com dados persistidos em `xp-data/postgres`; guarda `xp_employees`, `xp_sales`, `xp_settings`, `xp_audit_events` e sessoes `xp_sessions`. O MySQL `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings` fica apenas como referencia historica/backup; desde 2026-05-30 o app nao possui dependencia MySQL. O ADM tambem existe como perfil protegido em `system_key='adm'`, pode ter nome/foto editados, pode receber XP e nao pode ser excluido.
- Banco de Codigos: Postgres `wimifarma_codigos`, com dados persistidos em `codigos-data/postgres`; guarda `codigos_items`, `codigos_groups`, `codigos_audit_events` e sessoes `codigos_sessions`. O MySQL `wf_codigos_comissao` e `wf_codigos_blocos` fica apenas como referencia historica/backup; desde 2026-05-30 o app nao possui dependencia MySQL.
- Banco do Financeiro: Postgres `wimifarma_financeiro`, com dados persistidos em `financeiro-data/postgres`; guarda `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events`, `financeiro_migration_runs`, `financeiro_internal_idempotency` e `financeiro_sessions`. MySQL `financeiro_*` fica apenas como referencia historica/backup; o app nao possui mais `mysql2`, importador, espelho ou fallback de auth. Rollback exige restaurar versao anterior e backup validado.
- Banco da Cotacao V2: Postgres `wimifarma_cotacao`, com dados persistidos em `cotacao-data/postgres`.
- Banco da Gestao/Pedidos: Postgres `wimifarma_gestao`, com dados persistidos em `gestao-data/postgres`; `core_users` no Postgres core e o login oficial por padrao. Gestao e Pedidos nao possuem mais dependencia ativa de MySQL, nao recebem variaveis `MYSQL_*` no Compose e auditam em `core_audit_logs`/`gestao_audit_events`; `source_mysql_id` fica apenas como referencia historica importada.
- Banco da Tarefa: Postgres `wimifarma_tarefa`, com dados persistidos em `tarefa-data/postgres`; guarda `tarefa_tasks`, `tarefa_audit_events` e `tarefa_sessions`. `tarefa_tasks` pode ter `assigned_core_user_id` para tarefa privada por usuario. O app usa `core_users` como login unico e nao possui mais dependencia MySQL desde 2026-05-30; rollback MySQL exige restaurar versao anterior e backup validado.
- Banco do Miauby WhatsApp: Postgres `wimifarma_miauw_whatsapp`, com dados persistidos em `miauw-whatsapp-data/postgres`; guarda `miauw_whatsapp_contacts`, `miauw_whatsapp_contact_modules`, `miauw_whatsapp_events`, `miauw_whatsapp_outbox`, `miauw_whatsapp_confirmations` e `miauw_whatsapp_error_logs`, sem payload bruto do transporte WhatsApp nem telefone cru. `miauw_whatsapp_contacts` pode ter `linked_user_id` e snapshots para avisos individuais por funcionario, mantendo numero completo cifrado apenas no bridge.
- O inventario do uso restante de MySQL e o plano recomendado para migrar modulos internos para Postgres ficam em `docs/22-migracao-mysql-postgres.md`; WordPress deve ser tratado como excecao temporaria ou substituido/desacoplado se a meta for remover MySQL 100%.
- O inventario operacional dos modulos antigos e modernos fica em `docs/24-modernizacao-modulos.md` e pode ser gerado por `scripts/audit-modernization.ps1` no Windows ou `scripts/audit-modernization.sh` no Linux/VPS; use esse script antes de escolher a proxima migracao PHP -> Node.js/TypeScript/Postgres.
- O inventario detalhado por modulo fica em `docs/26-inventario-modulos.md`, com ficha de rota, telas, permissoes, tabelas MySQL/Postgres, arquivos PHP, fluxos de escrita, integracoes, riscos e proxima acao segura.
- Em 2026-05-30, `docs/26-inventario-modulos.md` recebeu as fichas detalhadas de Gestao, Pedidos, Tarefa, XP, Codigos, Usuarios e Cotacao. A migracao completa do Miauby interno deve seguir `docs/28-miauby-migracao.md`: `Miauby` e o nome canonico de produto, mas `miauw` continua como prefixo tecnico legado em rotas, env vars, containers, arquivos e tabelas ate existirem aliases/fallbacks e corte validado. A fase sombra criou o Postgres `wimifarma_miauby`, o migrador e a API interna somente leitura de paridade/readiness/contexto em `apps/miauby`, sem cortar leitura/escrita oficial. Nao renomear `site/miauw`, `/miauw/`, `MIAUW_*` ou `miauw_*` em massa.
- Em 2026-05-28, a migracao MySQL -> Postgres iniciou a etapa de core de autenticacao: `wimifarma-core-db` e `apps/core-auth` criam/sincronizam `core_users` a partir de `wf_users`, preservando `id`, `legacy_mysql_id`, hash de senha, role e active.
- Ainda em 2026-05-28, Cotacao V2, Gestao e Pedidos ganharam auth pelo core Postgres. Em 2026-05-29, Cotacao e Pedidos removeram o fallback MySQL, a dependencia `mysql2`, o `depends_on` de `wimifarma-com-db` e as variaveis MySQL do servico; em 2026-05-30, Gestao recebeu a mesma limpeza. O login desses apps depende apenas de `core_users` em `wimifarma_core`.
- Ainda em 2026-05-28, Tarefa foi migrado para `apps/tarefa` em Node.js 22 + TypeScript + Postgres, mantendo HTML/CSS/JS equivalentes ao modulo antigo. Em 2026-05-29, o login passou a usar `core_users` por default, preservando a sessao propria `WFTAREFA`; em 2026-05-30, o caminho MySQL restante foi removido do app, pacote, `.env.example` e Compose. Nao ha importador, espelho, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` nem flags `TAREFA_LEGACY_MYSQL_*`; rollback exige restaurar versao anterior e backup validado.
- Pedidos usa Postgres `pedidos_orders` e `pedidos_confirmed_orders` ligados a `gestao_accounts`; os valores/parcelas ficam em `gestao_account_items`, incluindo `due_at` por parcela quando houver vencimento, e os pagamentos ficam em `gestao_account_payments`, preservando totais mensais, categoria `Boleto` e auditoria. O vencimento geral em `gestao_accounts.due_at` e derivado da menor data ativa das parcelas para ordenacao/resumo. A previsao de chegada entra pela UI como dias ate chegar, mas a fonte de verdade continua sendo a data em `pedidos_orders.expected_arrival_at`. Editar fornecedor/valores/vencimentos passa por auditoria, remover da tela usa cancelamento/arquivamento logico, e `gestao_supplier_orders` fica apenas como legado/compatibilidade e fonte de migracao para dados criados antes da separacao.
- Para banco de dados novo, modelar entidades do dominio em tabelas proprias, usar FK/constraints, dinheiro em centavos inteiros, indices nos campos de filtro/join, indices parciais para filas/status, soft delete quando houver auditoria e documentar a fonte de verdade antes de escrever a tela.

## Portas e proxy

Nao misturar portas:

- `wimifarma-com-web:80`: destino correto dentro da rede Docker para o Nginx Proxy Manager.
- `127.0.0.1:3002`: porta local do Compose no VPS/local.
- `127.0.0.1:13002`: tunel local do PuTTY usado em testes no Windows.
- `80/443`: portas publicas do Nginx Proxy Manager.
- `wimifarma-cashback-app:4000`: destino interno oficial do Apache para `/cashback/`.
- `wimifarma-cotacao-app:3000`: destino interno do Apache para `/cotacao/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-gestao-app:3200`: destino interno do Apache para `/gestao/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-pedidos-app:3300`: destino interno do Apache para `/pedidos/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-tarefa-app:3500`: destino interno do Apache para `/tarefa/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-xp-app:3600`: destino interno oficial do Apache para `/xp/`.
- `wimifarma-codigos-app:3700`: destino interno oficial do Apache para `/codigos/`.
- `wimifarma-financeiro-app:3800`: destino interno oficial do Apache para `/financeiro/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-usuarios-app:3900`: destino interno oficial do Apache para `/usuarios/`; nao publicar diretamente no Nginx Proxy Manager.
- `wimifarma-miauw-whatsapp:3400`: destino interno do Apache para `/miauw/whatsapp/`; nao publicar diretamente no Nginx Proxy Manager.

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
- `tarefa-data/`
- `xp-data/`
- `codigos-data/`
- `financeiro-data/`
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
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas:

- `/cashback/login.php`
- `/codigos/login.php`
- `/codigos/health`
- `/cotacao/login.php`
- `/cotacao/health`
- `/financeiro/login.php`
- `/gestao/login.php`
- `/xp/login.php`
- `/xp/health`
- `/tarefa/login.php`
- `/tarefa/health`
- `/miauw/login.php`
- `/miauw/widget-status.php`
- `/miauw/agent/health`
- `/miauw/whatsapp/`
- `/miauw/whatsapp/health`

## Auditoria antes de encerrar alteracoes

Rode pelo menos:

```powershell
docker compose ps
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/gestao/login.php
curl.exe -sS http://127.0.0.1:3002/gestao/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/widget-status.php
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-gestao-app
docker compose logs --tail=80 wimifarma-miauw-whatsapp
```

Quando mexer em front-end ou fluxo visivel, abrir no navegador e validar visualmente.

## Estado validado em 2026-05-12

- A Cotacao V2 foi reestruturada diretamente em `/cotacao/` com `apps/cotacao` usando Node.js/Express/Socket.IO.
- O Apache do container `wimifarma-com-web` faz proxy de `/cotacao/` e `/cotacao/socket.io/` para `wimifarma-cotacao-app:3000`.
- Os dados novos da planilha ficam em Postgres `wimifarma_cotacao`; sessoes e presenca usam Redis.
- Desde 2026-05-29, o login da Cotacao V2 usa somente `core_users` no Postgres `wimifarma_core`, sem abrir conexao MySQL nem usar `wf_users`.
- Palavras historicas `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum na categoria. Nao existe gatilho escondido por palavra para cor, prioridade, ordem, filtro ou alerta.
- Formatacao condicional da Cotacao V2 e explicita, criada/removida pela propria tela em `cotacao_v2_rules`.
- A tela principal da Cotacao V2 usa visual denso de planilha operacional, com cabecalho compacto, abas locais, contador de linhas com dados, presenca no topo, exportacao CSV no navegador e colunas iniciais `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, `Anb`, `Profarma`, `mauro`, `arthur`, `Santa`, `tom`, `cimed` e `Ganhador`.
- A presenca da Cotacao V2 mostra usuarios com nomes aleatorios/deterministicos de animais por aba, no estilo Google Sheets; o usuario real fica apenas como contexto interno/tooltip.
- A grade da Cotacao V2 permite menu de contexto enxuto para inserir linhas, colorir/limpar cor e inserir/apagar somente colunas de distribuidoras. Apagar linha saiu do menu por seguranca; as quatro primeiras colunas e `Ganhador` nao devem ser renomeadas nem apagadas pela interface.
- `Ganhador` e coluna calculada no frontend pelo menor preco numerico entre distribuidoras visiveis; ela nao deve aceitar escrita manual por API ou tela.
- A paleta da Cotacao V2 grava estilos manuais em `cotacao_v2_styles` para linha, coluna ou celula. Cores manuais nao podem virar gatilhos escondidos por texto.
- Validacoes locais passaram para: health da Cotacao, login `adm`, bootstrap, save por celula dessas quatro palavras criticas, criacao/remocao de regra condicional explicita, importacao temporaria de linhas e limpeza dos dados de smoke.
- O proximo passo de Cotacao deve ser evoluir a V2 com presenca visual forte, auditoria/historico de eventos, import/export Sheets e diagnostico operacional, nao continuar remendando a planilha PHP antiga.

## Estado validado em 2026-05-13

- A Cotacao V2 ganhou fluxo mais proximo do Google Sheets: selecao multipla, celula ativa, setas de navegacao, `Enter` descendo para a celula abaixo, digitacao direta ao selecionar celula, `Ctrl+V` para colar matriz, `Ctrl+Z`/`Ctrl+Y` e botoes de desfazer/refazer.
- Os botoes visiveis `Adicionar linhas` e `Colar do Sheets` foram removidos; inserir linhas fica no menu de contexto e adicionar mais linhas em lote fica no rodape da grade.
- O topo da Cotacao V2 ficou mais compacto, com apenas `Wimifarma Cotacao`, `Home`, `Baixar` e `Sair`; as abas temporarias `Farmacia Popular` e `Bebe` foram removidas, e o diagnostico saiu do menu principal.
- Filtros de `CATEGORIA` e `Ganhador` ficam nos icones do cabecalho da grade, com selecionar tudo, limpar tudo e aplicar selecao local por tela.
- A API recebeu `PATCH /cotacao/api/cells/batch` para colagens em lote, endpoints de diagnostico, backup/restore do Postgres, import/export Google Sheets e renomear/reordenar distribuidoras com auditoria.
- Import/export Google Sheets usa ID estavel de linha (`cotacao_row_id`) para reduzir risco de duplicar ou sobrescrever linhas durante sincronizacao.
- Backup/restore da Cotacao V2 grava em `cotacao-data/backups` no host e `/app/backups` no container; `cotacao-data/` continua fora do Git.
- A presenca visual por campo existe para edicao remota enquanto uma celula local esta em edicao; ainda precisa ser validada com usuarios reais e virar teste automatizado permanente.
- A grade da Cotacao V2 agora permite texto quebrar linha e aumentar a altura da celula, redimensionar largura de colunas pelos titulos, selecionar coluna pelo cabecalho, selecionar linha pelo numero, renomear distribuidora com duplo clique no cabecalho e adicionar 20 linhas no fim da rolagem.
- Apagar distribuidora fica liberado no fluxo normal da equipe; a coluna e ocultada e pode voltar por `Ctrl+Z`/desfazer na mesma sessao.
- `Ctrl+C` copia a selecao como matriz TSV e `Ctrl+V` cola matriz normalizando texto e numeros/precos para o padrao da Cotacao.
- `Ctrl+Z`/desfazer tambem cobre filtros locais, alem de edicoes de celula, colagens, pintura manual/borracha de estilos e colunas; `Ctrl+Y`/`Ctrl+Shift+Z` refaz a mesma acao local.
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
- Durante o arrasto da alca de preenchimento, a grade mostra uma previa visual forte das celulas de destino que receberao a copia.
- Durante o redimensionamento de coluna pelo cabecalho, a grade mostra linha guia e etiqueta com largura atual em pixels e variacao desde o inicio do arraste.
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
- A Etapa 1 de seguranca/performance da Cotacao V2 adicionou apenas indices aditivos no Postgres para o snapshot atual e ampliou `/cotacao/api/diagnostics` com blocos `safety` e `performance`.
- `/cotacao/api/bootstrap` continua sendo o fallback completo e confiavel durante a evolucao do sync incremental/delta.
- A Etapa 2 adicionou `GET /cotacao/api/events?after=<eventId>` e passou o refresh automatico da Cotacao para eventos incrementais. O bootstrap continua sendo fallback quando o delta pede `requiresSnapshot`, como em import, restore, mudanca estrutural de coluna, cursor invalido ou excesso de eventos.
- A Etapa 3 reduziu trabalho de mutacoes simples da Cotacao V2: salvar celula, colagem em lote, estilos, regras, linhas e colunas agora validam quote/linha/coluna com consultas leves em vez de chamar `loadSheet()` e puxar o snapshot completo. `loadSheet()` permanece para bootstrap, diagnostico e operacoes fortes como backup/import/export/restore.
- Regras condicionais antigas ou restauradas por backup com alvo de linha inteira sao normalizadas para `target='cell'` na inicializacao da Cotacao V2; regra condicional deve pintar somente a celula da coluna-alvo, nunca a linha inteira.
- A digitacao em celulas da Cotacao V2 agenda o auto-ajuste de altura por `requestAnimationFrame`, reduzindo recalculo de layout a cada tecla sem alterar save/sync.
- A Etapa 4 tornou o save de celula otimista no frontend: ao trocar de celula, a grade atualiza a linha imediatamente e salva em segundo plano; confirmacao/erro volta pela API sem redesenhar a tabela inteira para cada celula simples.
- A presenca da Cotacao V2 tambem marca a celula visivel onde outro usuario esta selecionando/editando, com contorno colorido, etiqueta do animal e tooltip com coluna/linha; isso e informativo e nao bloqueia edicao.
- Apagar conteudo com `Delete`/`Backspace` na selecao tambem usa lote otimista no frontend: a grade limpa primeiro, salva em segundo plano e atualiza somente as linhas afetadas quando a selecao e pequena.
- Filtros da Cotacao V2 continuam locais por tela; filtrar em um computador nao muda a visao de outro. Duas pessoas na mesma celula seguem o comportamento pedido estilo Sheets: o ultimo salvamento vence, enquanto a presenca visual mostra quem esta na celula e o log de eventos permite recuperar valor anterior.
- O topo da Cotacao V2 possui botao `Historico` ao lado do contador de linhas com dados; ele abre o historico da celula selecionada e permite restaurar o valor anterior por um save normal/auditado.
- O modal de formatacao condicional usa layout largo e compacto: criacao de regra em faixa unica, regras existentes em linhas alinhadas e acoes `Salvar`/`Apagar` lado a lado no desktop.
- O botao `Sair` da Cotacao V2 encerra a sessao da Cotacao e redireciona para a home inicial `/`, nao para a tela de login.
- A home publica ganhou o card `Códigos` como sexto card, abaixo do Cashback no grid desktop de no maximo cinco cards por linha; os cards foram posicionados mais acima para acomodar a segunda linha.
- O modulo `Codigos` controla atalhos de itens com comissao diferente em tabela simples editavel com `Código`, `EAN` e `Preço`; a rota oficial usa `apps/codigos` e Postgres, mantendo `site/codigos` apenas como assets da tela.

## Estado validado em 2026-05-15

- O modulo `Codigos` salva automaticamente edicoes de `Código`, `EAN` e `Preço` por `/codigos/api.php` no servico `apps/codigos`, com sessao `WFCODIGOS` e CSRF; o botao Salvar saiu do fluxo normal.
- A tela de Códigos e dividida em blocos por prefixo de EAN, mantendo `EAN 20` e `EAN 40` como blocos padrao e permitindo criar novos blocos pelo botao `+`; os blocos sao persistidos oficialmente no Postgres em `codigos_groups`, cada bloco tem linha nova no rodape para adicionar itens sem misturar os grupos, e o layout usa largura ampla para aproveitar melhor as laterais da tela.
- Em Códigos, editar uma linha preserva a posicao atual quando o prefixo do EAN nao muda; reordenacao e feita arrastando o numero da linha dentro do mesmo grupo e persiste em `codigos_items.sort_order`.
- Apagar codigo continua sendo acao explicita com confirmacao e exclusao logica em `codigos_items.deleted_at`.
- O login de Códigos segue o mesmo padrao visual vinho/rosa dos outros logins internos; a autenticacao usa somente `core_users`, sem fallback `wf_users` desde 2026-05-30.
- Em Códigos, novos blocos de EAN sao criados com o prefixo digitado pelo usuario, sem sequencia automatica; as tabelas aparecem lado a lado em faixa horizontal, aproveitando mais a largura do monitor.
- Em Códigos, tabelas inteiras de blocos numericos nao padrao podem ser excluidas por um botao no cabecalho do EAN, com card de confirmacao e senha operacional `wimifarma`; `EAN 20`, `EAN 40` e `Outros` sao protegidos.
- Em 2026-05-17, o visual de Códigos foi alinhado ao tema vinho/rosa do site no login e na tela principal, e a faixa horizontal de tabelas passou a ficar contida no proprio modulo para evitar rolagem lateral vazia no documento.
- Em Códigos, a coluna `Código` deve mostrar o nome inteiro visualmente: textos longos podem quebrar linha e aumentar a altura da linha/tabela, preservando autosave e leitura operacional sem truncar a frase.
- Na Cotacao V2, colagem de matriz, desfazer/refazer de lotes e a alca de preenchimento usam save em lote otimista com atualizacao apenas das linhas afetadas; outras telas tambem aplicam eventos de celula por linha, sem redesenhar a grade inteira quando o evento nao e estrutural.
- A Cotacao V2 ganhou `PUT/DELETE /cotacao/api/styles/batch` para aplicar ou apagar estilos em lote, reduzindo varias chamadas pequenas quando cores sao copiadas pelo fill handle ou aplicadas em selecoes grandes.
- Na Cotacao V2, durante a edicao de uma celula, `Enter` salva e desce exatamente uma linha. Duplo clique e `F2` devem abrir edicao sem selecionar todo o conteudo da celula e manter as setas dentro do texto; digitacao direta em celula selecionada deve permitir usar setas para confirmar o valor e navegar para a celula vizinha.
- O Financeiro nao exibe mais o botao/view `Auditoria` na navegacao principal; URLs com `?view=auditoria` voltam para a tela `Caixa`, enquanto os registros em `financeiro_audit_events` continuam sendo gravados internamente no Postgres. Desde 2026-05-30 nao existe mais espelho runtime para `financeiro_auditoria` no MySQL; esse historico fica apenas como referencia/backup.
- Em 2026-05-20, o Financeiro foi ajustado para linkar explicitamente Relatorio e Caixa no fechamento sem movimento: o botao `Fechar sem movimento` do Relatorio marca o mesmo `financeiro_fechamentos.status='sem_movimento'` usado pelo Caixa, mas esse status nao trava edicao. Informar venda/faturamento depois converte o dia para `conferencia` e libera o fluxo normal de Caixa.
- O Miauby iniciou a Fase 1 do agente operacional v2 no backend PHP atual: possui `MIAUW_AGENT_VERSION`, `MIAUW_AGENT_POLICY_VERSION`, status publico de agente no widget/API, prompt com isolamento operacional e guardrail final que substitui mencoes a bastidores tecnicos por suporte tecnico interno sem expor agente de desenvolvimento, fornecedor, chave, prompt ou stack trace ao operador.
- O Miauby iniciou a Fase 2 do agente operacional v2 com `site/miauw/miauw-evals.php`, runner CLI que testa intents de Financeiro, Tarefas e Cotacao, rotas de modelo, registry de skills e respostas proibidas sem chamar a OpenAI nem executar escritas reais. Rodar com `docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php`.
- Os guardrails finais do Miauby tambem substituem fragmentos de chaves `sk-...` por `credencial interna` antes de qualquer resposta ao operador.
- O Miauby iniciou a Fase 3 com `/miauw/diagnostico.php`, painel restrito a `admin`, `gerente` ou usuario `adm`, mostrando status do agente/API, modelos, registry de skills, alertas, diagnosticos internos recentes e revisao de `miauw_memorias`/`miauw_padroes`.
- `miauw_memorias` e `miauw_padroes` possuem colunas aditivas `revisao_status`, `reviewed_by` e `reviewed_at`; aprovar/ignorar no painel apenas marca revisao e registra `wf_logs`, sem apagar dados.
- O Miauby iniciou a Fase 4 do agente operacional v2: as tools core foram migradas para o registry e cobrem sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- A consulta/escrita de encomenda da Cotacao pelo Miauby agora usa a Cotacao V2 por ponte interna tokenizada no Node: `GET /cotacao/api/internal/search` e `POST /cotacao/api/internal/encomendas`. Esses endpoints exigem `X-Miauw-Internal-Token` e ficam desabilitados se `COTACAO_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN` nao estiver configurado.
- Em 2026-05-30, as tools do Miauby para Cashback, Tarefa, Cotacao, Codigos e Financeiro foram presas aos endpoints internos Node/Postgres dos modulos. Se a ponte moderna ou token falhar, o Miauby responde indisponibilidade e nao cai mais em `wf_tarefas`, `wf_compras`, `wf_clientes`, `wf_codigos_comissao`, `cotacao_*` antigo ou `financeiro_*` legado MySQL.
- O PHP do Miauby usa `COTACAO_INTERNAL_BASE_URL` para falar com `wimifarma-cotacao-app:3000/cotacao`, e usa `COTACAO_INTERNAL_TOKEN` com fallback para `MIAUW_GUARDIAN_TOKEN`; valores reais continuam somente no `.env`/ambiente.
- `site/miauw/miauw-evals.php` cobre a Fase 4 com registry das tools core, sangria sem valor proibida e contrato das tools de Codigos, sem chamar OpenAI nem executar escritas reais.
- O Miauby iniciou a Fase 5 com `MIAUW_AGENT_VERSION=2.0-fase5`, tabela `miauw_tool_traces`, trace por conversa/request/tool, status de traces no painel `/miauw/diagnostico.php`, streaming visual no chat/widget e card de confirmacao para acoes fortes antes de gravar dados.
- Acoes fortes do Miauby, como sangria/lancamento financeiro, faturamento diario, encomenda/urgente/cotacao rapida e nova planilha de cotacao, devem pedir confirmacao humana e so executar apos confirmar. A resposta e os traces devem continuar sem expor chave, payload bruto, SQL, stack trace ou bastidor tecnico.
- O Miauby iniciou a Fase 6 com `MIAUW_AGENT_VERSION=2.0-fase6`: os evals locais agora cobrem contrato da proxima camada, schema das tools, alinhamento registry/OpenAI tools, dados incompletos sem escrita, Cotacao pedindo termo quando falta produto/EAN/categoria, regra de nao inventar dados e confirmacao obrigatoria para escrita forte por risco.
- A proxima camada do Miauby esta preparada por contrato em `miauw_agent_next_phase_contract()`: Node.js 22 + TypeScript, Agents SDK e endpoint interno `/miauw/agent`. Ainda nao trocar o motor do Miauby sem manter compatibilidade com PHP, sessao, widget, registry, traces, confirmacoes e evals atuais.
- O Miauby iniciou a Fase 7 com `MIAUW_AGENT_VERSION=2.0-fase7`: `apps/miauw-agent` cria um servico Node.js 22 + TypeScript com `@openai/agents`, health/status publicos e endpoints internos `run`/`stream` protegidos por `MIAUW_AGENT_INTERNAL_TOKEN` ou fallback `MIAUW_GUARDIAN_TOKEN`. O servico esta em modo sombra, sem escrita real; o PHP continua dono de login, widget, confirmacoes, registry e auditoria.
- O Miauby iniciou a Fase 8 com `MIAUW_AGENT_VERSION=2.0-fase8`: o PHP possui adaptador para chamar o servico Node em modo sombra, comparar resposta oficial PHP com resposta sombra, gravar `miauw_agent_shadow_compare` em `miauw_tool_traces` e mostrar status no diagnostico. Por padrao `MIAUW_AGENT_SHADOW_ON_SEND=false`, entao isso nao altera nem atrasa o chat da equipe; ligar somente para coleta controlada.
- O Miauby iniciou a Fase 9 com `MIAUW_AGENT_VERSION=2.0-fase9`: existe `MIAUW_ENGINE=php|node_shadow|node` para alternar motor com rollback por `.env`; `node_shadow` compara Node para usuarios liberados, `node` usa Node como resposta oficial para esses usuarios e cai para PHP se o Node falhar. `MIAUW_MAINTENANCE_MODE=true` bloqueia envio de usuarios comuns durante implantacao acelerada e `adm` fica liberado por padrao em `MIAUW_AGENT_ENGINE_ALLOWED_USERS`/`MIAUW_MAINTENANCE_ALLOWED_USERS`.
- O Miauby iniciou a Fase 10 com `MIAUW_AGENT_VERSION=2.0-fase10`: a personalidade do Miauby virou contrato versionado (`miauby-persona-2026-05-16`) no PHP e no servico Node. O prompt Node agora preserva o tom de fiscal interno, humor curto, bordoes controlados, pedido minimo de contexto e regra de nao inventar dados; `npm run check:persona` valida que o agente nao voltou para resposta generica/burocratica antes do deploy.
- O Miauby iniciou a Fase 11 com `MIAUW_AGENT_VERSION=2.0-fase11`: o PHP exporta contratos versionados das tools OpenAI a partir do registry (`miauw_agent_tool_contract_export()`), envia esse pacote ao servico Node em `run`/`stream` e o Node usa os contratos apenas como contexto operacional. A execucao real, confirmacoes, sessoes, auditoria e escritas fortes continuam no PHP; o Node segue com `writes_enabled=false`.
- O Miauby iniciou a Fase 12 com `MIAUW_AGENT_VERSION=2.0-fase12`: o servico Node executa a primeira tool real de leitura segura, `consultar_contrato_tool_miauby`, consultando somente os contratos de tools enviados pelo PHP. `writes_enabled=false` segue obrigatorio; login, sessoes, confirmacoes, auditoria e escritas reais continuam no PHP.
- O Miauby iniciou a Fase 13 com `MIAUW_AGENT_VERSION=2.0-fase13`: o servico Node executa tools reais de leitura baixa por ponte PHP interna tokenizada em `site/miauw/agent-tools.php`, com pre-leitura deterministica para pedidos claros e tools disponiveis ao Agents SDK. As tools liberadas no Node sao `resumo_financeiro`, `resumo_cashback`, `resumo_codigos`, `buscar_codigo_comissao` e `buscar_cotacao`; `buscar_cliente` fica fora da primeira leva por privacidade, e sangria/tarefa/encomenda/escritas fortes seguem no PHP com confirmacao e auditoria. O servico `wimifarma-miauw-agent` usa `MIAUW_PHP_TOOL_BRIDGE_URL` com padrao `http://wimifarma-com-web/miauw/agent-tools.php`, sem credencial direta de banco e com `writes_enabled=false`.
- O Miauby iniciou a Fase 14 com `MIAUW_AGENT_VERSION=2.0-fase14`: o servico Node `apps/miauw-agent` agora monta tools do Agents SDK dinamicamente a partir de `miauw_agent_tool_contract_export()` e orquestra todas as OpenAI tools pela ponte PHP universal `site/miauw/agent-tools.php`. O Node segue sem credencial de banco e sem escrita direta; leituras/diagnosticos/cliente mascarado executam no PHP auditado, `criar_tarefa` pode gravar como escrita de baixo risco com usuario logado, e sangria/lancamento/encomenda/acoes fortes retornam `confirmation_required`. Em 2026-05-26, esse retorno passou a voltar como evento estruturado do Node para o PHP, que cria a confirmacao na sessao real do operador e mostra o card `Confirmar/Cancelar`, evitando confirmacao fantasma que nao executa depois.
- O Miauby iniciou a Fase 15 com `MIAUW_AGENT_VERSION=2.0-fase15`: a resposta agora passa por um roteador de estilo versionado (`MIAUW_AGENT_STYLE_VERSION=miauby-style-router-2026-05-16`) antes de gastar chamada online. Perguntas casuais, bastidor tecnico, saudacoes, ruido e pergunta ampla podem receber resposta local curta pelo PHP/Node; o contexto enviado ao Node inclui rota, limite de palavras, regras de voz e memorias/padroes apenas quando revisados como `aprovado`. Isso evita respostas em formato de catalogo/lista como "leio dados..." e preserva o tom de gato fiscal em frases tipo "Oxe, por que voce quer mexer nisso?" sem expor bastidores.
- O Miauby iniciou a Fase 16 com `MIAUW_AGENT_VERSION=2.0-fase16`: o chat principal ganhou feedback `Boa`/`Treinar`, o painel restrito `/miauw/treino.php` revisa exemplos de resposta, e a tabela `miauw_treinos_respostas` guarda pergunta, resposta original, resposta ideal, motivo, categoria, estilo, status e versao. Somente treino aprovado entra no `style_context` enviado ao Node; ajustes de exemplo aprovado criam nova versao e preservam historico. O servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.10.0` e `PHASE=fase16-training-feedback`, ainda sem escrita direta no Node.
- Em 2026-05-17, o Miauby iniciou a Fase 17 com `MIAUW_AGENT_VERSION=2.0-fase17`: os treinos aprovados passaram a ser compilados em um perfil curto de voz/relevancia (`miauby-training-compiler-2026-05-17`) antes de ir para o Node, evitando prompt infinito por tema. Perguntas repetidas ou muito parecidas com treino aprovado podem responder localmente pelo `miauw-training-router`, sem chamada online, mantendo traces e guardrails. O servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.11.0` e `PHASE=fase17-training-compiler`, ainda sem credencial de banco e sem escrita direta.
- Em 2026-05-17, o Miauby iniciou a Fase 18 com `MIAUW_AGENT_VERSION=2.0-fase18`: o PHP passou a exportar perfis versionados de voz/tom (`miauby_padrao`, `miauby_curto`, `miauby_operacional`) e contrato seguro de audio (`miauby-audio-readiness-2026-05-17`) dentro do `style_context`. O servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.12.0` e `PHASE=fase18-voice-audio-readiness`; o Node entende `perfil_voz_miauby`/`audio_miauby`, mas audio real continua `text_only`, sem microfone, transcricao, TTS, playback ou gravacao ate existir botao e validacao propria.
- Em 2026-05-17, o Miauby ajustou a Fase 19 com `MIAUW_AGENT_VERSION=2.0-fase19`: o chat principal e o widget global usam o botao `Falar` em fluxo estilo WhatsApp, gravando audio temporario no navegador, transcrevendo no PHP com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, exibindo um rascunho local com player/duracao/transcricao e colocando o texto no campo para o usuario revisar, `Enviar`, `Refazer` ou `Descartar audio`. `MIAUW_AUDIO_ENABLED=true` libera a interface, o microfone so liga por clique, o audio nao e armazenado no banco, escrita operacional por voz continua bloqueada e acoes fortes seguem exigindo confirmacao humana; o servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.14.0` e `PHASE=fase19-record-transcribe-confirm`.
- Em 2026-05-17, o Miauby iniciou a Fase 20 com `MIAUW_AGENT_VERSION=2.0-fase20`: mensagens enviadas por voz aparecem no chat/widget como bolha de audio com player e ondas, enquanto a transcricao segue como texto interno/revisavel para o backend responder. Quando a entrada veio de audio, o PHP tambem gera resposta falada sob demanda por `/v1/audio/speech` com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts` e `MIAUW_SPEECH_VOICE=marin`, sem armazenar o audio gerado. Audios curtos demais, como gravacoes perto de 1 segundo, sao bloqueados antes/depois da transcricao para reduzir chute. O servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.15.0` e `PHASE=fase20-voice-reply-audio-bubbles`.
- Em 2026-05-17, o Miauby iniciou a Fase 21 com `MIAUW_AGENT_VERSION=2.0-fase21`: o playback de audio no chat/widget foi corrigido liberando `blob:`/`data:` apenas em `media-src` do CSP, a transcricao da resposta falada fica escondida por padrao atras de `Ver texto`, o prompt de TTS ganhou instrucoes fortes de fala real e o painel restrito `/miauw/diagnostico.php` ganhou seletor seguro de voz base (`marin`, `cedar`, `ash`, `coral`, `verse`) persistido em `miauw_configuracoes`. O servico `wimifarma-miauw-agent` passou para `SERVICE_VERSION=0.16.0` e `PHASE=fase21-voice-playback-profile-selector`.
- Ainda em 2026-05-17, o frontend de audio do Miauby foi ajustado para nao bloquear a captura apenas pelo pre-check `navigator.permissions`; ele tenta `getUserMedia()` de verdade, anexa o estado de permissao ao erro amigavel e evita repetir o mesmo aviso de microfone varias vezes em poucos segundos.
- Ainda em 2026-05-17, o header comum `Permissions-Policy` dos modulos internos passou a permitir `microphone=(self)` para o audio do Miauby no proprio dominio, mantendo camera e geolocalizacao bloqueadas.
- Em 2026-05-18, a Gestao iniciou a Fase 1 administrativa em `site/gestao`: login com o mesmo tema vinho/rosa, acesso restrito a `adm`, `admin` ou `gerente`, tabelas MySQL `gestao_contas`, `gestao_conta_itens` e `gestao_conta_pagamentos`, lancamento manual de contas com categoria livre, itens flexiveis, data de geracao automatica, status `pendente`/`pago`/`cancelado`, pagamentos parciais datados que somam no total pago do mes, saldo pendente por conta, adicao posterior de itens/juros e logs em `wf_logs`.
- Ainda em 2026-05-18, a Gestao passou para a base definitiva de modulo critico: `apps/gestao` em Node.js 22 + TypeScript, proxy Apache em `/gestao/`, Postgres 17 dedicado `wimifarma_gestao`, sessoes `WFGESTAO` no Postgres, dinheiro salvo em centavos inteiros, tabelas `gestao_accounts`, `gestao_account_items`, `gestao_account_payments` e `gestao_audit_events`. Em 2026-05-30, o caminho `mysql2` dormente da Gestao foi removido: nao ha importador, espelho `wf_logs`, fallback `wf_users`, `depends_on` de MySQL nem variaveis `MYSQL_*` no servico. No mesmo corte, a ponte Miauby -> Gestao ficou restrita aos endpoints internos tokenizados da Gestao Node/Postgres, com auditoria em `gestao_audit_events`/`core_audit_logs` e trace do Miauby, sem `wf_logs` no contrato da tool `criar_conta_gestao`. `source_mysql_id` fica apenas como referencia historica importada. O Node nao deve acessar credenciais diretas fora do `.env`, e `gestao-data/` fica fora do Git.
- Ainda em 2026-05-18, a Gestao passou a exibir cada conta como extrato: lancamentos/juros ficam em `gestao_account_items`, pagamentos parciais ficam em `gestao_account_payments`, saldo e barra de progresso sao calculados por conta, e `Quitar saldo` cria somente o pagamento final restante. O formulario de nova conta foi ajustado para nao estourar a coluna esquerda nem sobrepor a lista.
- Ainda em 2026-05-18, a Gestao ganhou a camada de ajuste fino do extrato: contas pagas podem ser reabertas para ajuste, faturas podem ser canceladas sem apagar historico, lancamentos e pagamentos individuais podem ser cancelados por status, pagamentos podem ser ligados a um lancamento por `item_id`, pagamentos por item respeitam tambem o saldo geral da conta para evitar duplicidade, observacoes da conta podem ser editadas, cards podem ser minimizados mantendo a barra verde visivel e o bloco lateral de notas usa `gestao_notepad_notes` com edicao e exclusao logica.
- Durante o deploy de 2026-05-16, o `wimifarma-com-db` do VPS foi encontrado reiniciando porque `/home/ubuntu/projetos/wimifarma-com/mysql` estava incompleto e sem `ibdata1`. O diretorio invalido foi preservado como `/home/ubuntu/projetos/wimifarma-com/mysql-invalid-20260516113246`, e o `mysql/` oficial foi restaurado de `/home/ubuntu/projetos/wimifarma-com-runtime-disabled-2026-05-14-170039/mysql` sem apagar a origem. Nao remover esses diretorios sem confirmacao clara.
- Em 2026-05-16, a Cotacao V2 do VPS foi encontrada apontando para um Postgres novo/vazio em `/home/ubuntu/projetos/wimifarma-com/cotacao-data/postgres`, com 20 linhas vazias e zero eventos. Os dados foram restaurados apenas nas tabelas `cotacao_v2_*` a partir da base preservada em `/home/ubuntu/projetos/wimifarma-com-runtime-disabled-2026-05-14-170039/cotacao-data/postgres`, mantendo o `quote_id` antigo `c3f0cb73-435e-48f3-bc6f-42f2eb7d2b16`: 178 linhas ativas, 11 linhas com dados, 15 colunas, 35 estilos, 2 regras e 672 eventos ate 2026-05-15 21:13 UTC. Backups SQL manuais da operacao ficaram em `/home/ubuntu/projetos/wimifarma-com/cotacao-data/manual-backups/`. Nao remover a base preservada nem os dumps sem confirmacao clara.
- Ainda em 2026-05-16, alguns containers de banco do VPS (`wimifarma-com-db`, `wimifarma-cotacao-db`, `wimifarma-cotacao-redis`) estavam rodando com label Compose `com.docker.compose.project=wimifarma-com-git`, embora usando o `docker-compose.yml` da pasta oficial. Enquanto esse estado nao for normalizado com janela e backup, deploy pontual de app deve evitar recriar dependencias, por exemplo `docker compose up -d --no-deps --build wimifarma-cotacao-app`.
- Em 2026-05-16, a sincronizacao da Cotacao V2 foi reforcada para apagamentos e eventos remotos durante edicao: `Delete`/`Backspace` segue por `/cotacao/api/cells/batch`, lotes sem mudanca real nao criam evento vazio, e eventos de celula/lote recebidos enquanto a aba edita outra celula sao redesenhados ao encerrar a edicao para manter `Ganhador`, contadores e celulas dependentes atualizados.
- Em 2026-05-16, os travamentos de distribuidora/resize foram atacados: eventos leves de coluna (`column_created`, `column_renamed`, `column_moved`, `column_deleted`, `column_restored`, `column_resized`) deixaram de exigir snapshot completo e agora carregam payload incremental; o frontend ignora o proprio evento de Socket.IO e atualiza coluna/ordem localmente. Redimensionar coluna nao recalcula mais altura de todos os textareas a cada movimento do mouse, apenas ao fim do arrasto. A API da Cotacao tambem usa `no-store`/sem ETag para impedir `304` em `/cotacao/api/events`, que fazia a tela cair em fallback pesado de snapshot.
- Em 2026-05-16, o numero da linha da celula ativa na Cotacao V2 passou a ficar verde forte no frontend, como referencia visual local estilo Google Sheets; isso nao grava estado nem sincroniza com outras abas.
- Em 2026-05-17, o widget do Miauby na Cotacao V2 ganhou uma ronda visual local com `pikachu-loop.webp`: ele sai do balao do Miauby, circula pela tela, desvia do mouse e volta ao widget. O efeito nao grava estado, nao usa Socket.IO e nao altera dados ou sincronizacao da Cotacao.
- Em 2026-05-16, o carregamento inicial da Cotacao V2 deixou de bloquear a tela ajustando a altura de todos os `textarea` de uma vez; a grade renderiza primeiro e o auto-ajuste completo roda em pequenos lotes por frame para reduzir segundos de `Carregando...`.
- Em 2026-05-16, o resize da Cotacao V2 foi refinado para o travamento ao soltar o mouse: o auto-ajuste de altura pos-resize roda apenas na coluna alterada, em pequenos lotes por frame, e o Socket.IO passou a usar `column:resized` em vez de `columns:changed` para que abas com JavaScript antigo nao facam bootstrap completo ao receber resize.

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
- No widget do Miauby, `api_ready` significa chave preenchida, nao validacao online. Se o chat cair no fallback, conferir logs/alertas internos para autenticacao, cota, modelo ou rede; a resposta ao operador nao deve expor chave, payload nem stack trace.
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

Para mudancas no servico do Miauby agente, incluir o servico novo no rebuild:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --no-deps --build wimifarma-miauw-agent wimifarma-com-web
docker compose ps
curl -I https://wimifarma.com/miauw/agent/health
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
- Isso ainda nao substitui um motor completo estilo Google Sheets. Para edicao simultanea forte, evoluir com presenca visual, historico/auditoria de eventos, import/export Sheets e diagnostico operacional.

Antes de implementar:

- Mapear tabelas `cotacao_*`.
- Definir ID estavel para cada item/linha.
- Definir fonte de verdade por campo.
- Criar auditoria de sync.
- Manter regra de ultima gravacao vencendo para mesma celula e evoluir recuperacao/auditoria pelo historico.
- Preservar formatacao importante da planilha.
- Criar job/cron de sincronizacao.
- Criar tela de diagnostico do sync.
- Usar Miauby para resumir divergencias e tarefas pendentes.
- Evoluir Miauby por skills controladas, registry de ferramentas, auditoria e revisao de padroes; veja `docs/18-miauby-evolucao-generativa.md`.
- Para tempo real da Cotacao, seguir `docs/19-cotacao-tempo-real.md`.

Evite sincronizacao por string solta. Use API estruturada do Google Sheets quando conector/credencial estiver definido.

## Estado validado em 2026-05-18 - Gestao

- A Gestao permite clicar em cada lancamento para abrir suas acoes sem poluir o extrato inteiro.
- Qualquer lancamento ativo pode receber pagamento parcial proprio, quitacao, juros/diferenca e cancelamento.
- Lancamento cancelado pode ser reaberto sem ressuscitar pagamentos cancelados; pagamentos cancelados continuam apenas como historico, e o total da conta e recalculado pelos lancamentos ativos.
- Os cards de conta da Gestao ficam compactos por padrao em linha fina e abrem/fecham pelo botao `Abrir`; ao abrir uma conta, os lancamentos e o bloco `Pagamentos desta conta` tambem ficam fechados ate o operador clicar, mantendo a tela mais limpa.
- A Gestao aceita renomear conta ja lancada, repetir a conta para o mes seguinte com os itens ativos e sem copiar pagamentos, deixa a observacao minimizada por padrao e move lancamentos pagos/cancelados, pagamentos cancelados e eventos de auditoria para o bloco `Historico`, tambem minimizado por padrao.
- Ainda em 2026-05-18, a Gestao ganhou resumo lateral por categorias livres normalizadas: `aluguel`, `Aluguel` e `ALUGUEL` aparecem como uma categoria, com contadores de abertas em verde e fechadas em vermelho. Sem filtro, a lista mostra contas abertas; contas pagas/canceladas ficam acessiveis por busca ou filtro de categorias. Ao clicar na categoria, mostra as contas daquela categoria com abertas primeiro. O painel permite trocar categoria em lote e cancelar somente contas abertas do grupo, preservando historico fechado.
- Ainda em 2026-05-18, a Gestao ganhou vencimento opcional, ordenacao por urgencia em contas pendentes, aviso visual de vencido/vence hoje/vence em poucos dias, edicao/limpeza de vencimento dentro da conta, renomeacao por icone de lapis e botao de repeticao como ciclo liga/desliga. Ativar repeticao cria ou garante copia idempotente no mes seguinte com itens ativos e vencimento avancado; desligar nao apaga copia ja criada para evitar perda acidental.
- Em 2026-05-19, a Gestao recebeu ajuste visual para reduzir excesso de informacao: `Vencimento`, `Pagamentos`, `Observacao`, `Historico` e `Ajustes e pagamento` ficam alinhados como blocos recolhidos, com respiro maior entre formularios e contraste mais claro para pagamento, lancamentos e alertas de urgencia.
- Em 2026-05-19, a Gestao passou a permitir excluir contas canceladas da tela sem apagar fisicamente: a acao arquiva em `gestao_accounts.archived_at`/`archived_by`, remove dos totais/listas/categorias visiveis e preserva itens, pagamentos e auditoria. Categorias filtradas tambem podem arquivar canceladas em lote.
- Em 2026-05-19, o Miauby ganhou comandos controlados para Gestao: `gestao`/`abrir gestao` aponta para `/gestao/`, e comandos de criacao preparam conta a pagar com confirmacao humana antes de gravar pelo endpoint interno tokenizado da Gestao. A tool `resumo_gestao` e leitura baixa; `criar_conta_gestao` e escrita forte com auditoria.
- Em 2026-05-19, Pedidos foi corrigido para modulo separado em `/pedidos/` com `apps/pedidos` e container `wimifarma-pedidos-app:3300`. A lista separa `Pedidos feitos`, `Aguardando chegada`, `Confirmados` e `Historico` lado a lado no desktop; confirmar chegada move para Confirmados ou direto para Historico se ja estava pago; pagar parcial/total usa `gestao_account_payments`, adiciona juros/diferenca por item, ordena vencimentos proximos primeiro e arquiva em Historico quando recebido e quitado. Cada card permite editar fornecedor/valores ou excluir da tela por cancelamento/arquivamento logico auditado, e `/pedidos/` carrega o widget do Miauby. A home publica ganhou o card `Pedidos` ao lado de `Cotacao` com badge da quantidade total em `Aguardando chegada` via `/pedidos/api/badge`. A rota antiga `/gestao/pedidos` redireciona para `/pedidos/`.
- Em 2026-05-20, cards em `Aguardando chegada` e `Confirmados` passaram a exibir icone de lapis para abrir a edicao de fornecedor/valores e icone de excluir para arquivar da tela quando nao houver necessidade de registrar o boleto, mantendo auditoria e arquivamento logico.
- Ainda em 2026-05-20, cards em `Aguardando chegada` e `Confirmados` de Pedidos passaram a minimizar/expandir ao clicar na area de resumo do card, sem botao `+/-`, com estado salvo no navegador e padrao minimizado. No modo reduzido, `Aguardando chegada` mantem a acao `Confirmar chegada` visivel e `Confirmados` mantem `Pago` visivel, com chips compactos de status, vencimento/saldo para leitura rapida. O vencimento do boleto e a data de pagamento parcial na interface de Pedidos passaram a ser somente data, sem horario.
- Em 2026-05-25, a tela de Pedidos ficou mais densa visualmente: cards-resumo do topo usam altura menor e os cards minimizados de `Aguardando chegada`/`Confirmados` reduzem padding, chips, botoes e icones para caber mais pedidos por tela; a acao principal fica em botao curto alinhado a direita, nao em barra larga. Em 2026-05-26, o topo tambem passou a mostrar `Valor para chegar`, somando o saldo ainda nao pago dos pedidos aguardando chegada, e `Valor boletos abertos`, somando o saldo ainda nao pago dos boletos confirmados em aberto.
- Em 2026-05-29, o layout de Pedidos foi ajustado para nao quebrar em zoom alto/intermediario: antes do ponto mobile, a grade operacional passa de quatro para duas colunas, os cards de resumo toleram valores maiores sem cortar e os cards minimizados reorganizam valor, icones e acao principal sem sobreposicao.
- Em 2026-05-30, os cards do `Historico` de Pedidos tambem passaram a abrir minimizados por padrao, usando o mesmo clique no resumo para expandir detalhes, sem alterar o fluxo financeiro nem as acoes de `Aguardando chegada` e `Confirmados`.
- Ainda em 2026-05-30, o painel do lapis em Pedidos foi estruturado para alterar fornecedor, editar parcelas atuais, retirar parcelas por cancelamento logico quando nao ha pagamento vinculado e adicionar nova parcela com vencimento opcional. Tudo continua usando `gestao_account_items`, recalculo de total/vencimento/status e auditoria em Postgres.
- Ainda em 2026-05-20, o formulario de Pedidos ganhou a opcao `Ja chegou, so pagar`: o pedido nasce direto em `Confirmados`; se tambem estiver marcado como ja pago, nasce recebido e quitado em `Historico`, preservando conta `Boleto`, itens, pagamentos e auditoria.
- Em 2026-05-20, o Miauby foi ajustado para comandos de Gestao: `gestao - 500 - Will - geral` tambem e aceito, e uma nova mensagem iniciada por `gestao` substitui pendencia incompleta anterior em vez de juntar prompt antigo com prompt novo. Falhas em acoes confirmadas gravam diagnostico invisivel com `trace_id`, ferramenta, confirmacao e contexto sanitizado, visivel de forma resumida em `/miauw/diagnostico.php`.
- Ainda em 2026-05-20, a Gestao ganhou busca operacional abaixo dos resumos do mes, filtrando por titulo, categoria, status, valor aproximado, saldo, vencimento, lancamento e pagamento, com 10 resultados iniciais, `Mostrar mais` e `Limpar`; o cabecalho da tela foi reduzido e a frase longa removida. O arquivamento de conta cancelada ficou atomico/idempotente para tirar da tela por `archived_at` sem apagar dados. O Miauby passou a aceitar tambem `gestao - 50 - Will`, `gestao - Will - 50`, `gestao Will 50` e categoria antes/depois; quando houver nome + valor sem categoria, usa `geral`, preservando confirmacao humana antes da escrita.
- Em 2026-05-23, a Gestao passou a renderizar a lista principal em linhas finas `Categoria / Nome / Valor / Pagar / Abrir`, mostrando por padrao somente contas abertas do mes para reduzir poluicao visual. O botao `Pagar` registra a quitacao pelo fluxo financeiro existente e `Abrir` expande o extrato completo. O painel `Mensal` virou uma lista ao lado da principal, com a mesma estrutura compacta, e a ordem das contas com `Repetir mes que vem` ativo pode ser alterada por arrastar, persistindo em `gestao_accounts.monthly_sort_order` e auditando `gestao_mensal_ordem_atualizada`.
- Em 2026-05-24, o vencimento da Gestao na interface passou a ser informado apenas por data, sem campo de horario, e o painel `Mensal` recebeu layout compacto proprio para evitar que valor, `Pagar` e `Abrir` se sobreponham em telas estreitas.

## Fluxo de trabalho esperado

- Ler contexto e documentacao antes de agir.
- Fazer uma auditoria curta antes de editar.
- Para problemas visuais apenas na home publica, verificar primeiro `site/home.php` e `site/.htaccess`; WordPress continua responsavel por `/wp-admin`, posts e rotas legadas.
- Alterar pouco por vez.
- Rodar validacoes proporcionais ao risco.
- Atualizar docs quando qualquer comportamento importante mudar.
- Ao final, se houve alteracao de arquivo, preparar commit/push e, quando houver deploy aplicavel, executar diretamente no VPS e relatar os comandos/validacoes realizados.

## Relatorio final obrigatorio

Ao finalizar, responder em portugues com:

- arquivos alterados;
- documentacao criada/atualizada;
- comandos executados;
- testes/build/lint realizados;
- pendencias abertas;
- riscos/cuidados encontrados.
