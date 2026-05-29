# 01 - Arquitetura

## O que esta parte do sistema faz

A arquitetura atual empacota o sistema migrado do HostGator em Docker. O container web serve WordPress, modulos PHP internos e faz proxy para Cotacao V2, Gestao, Pedidos, Tarefa, XP, Codigos, Miauby agente e Miauby WhatsApp; o Financeiro ainda roda em PHP na rota oficial, com uma sombra Node/Postgres separada para importacao/checksum. Os dados ficam separados entre MySQL legado/apps, Postgres da Cotacao V2, Postgres da Gestao/Pedidos, Postgres da Tarefa, Postgres do XP, Postgres de Codigos, Postgres sombra do Financeiro, Postgres do WhatsApp do Miauby e Redis de sessoes/presenca.

## Componentes envolvidos

```text
Usuario/Navegador
  -> DNS GoDaddy
  -> VPS Oracle/Ubuntu
  -> Nginx Proxy Manager (80/443)
  -> wimifarma-com-web:80 (Apache/PHP)
      -> WordPress e modulos PHP
      -> proxy /cotacao/ para wimifarma-cotacao-app:3000
      -> proxy /gestao/ para wimifarma-gestao-app:3200
      -> proxy /pedidos/ para wimifarma-pedidos-app:3300
      -> proxy /tarefa/ para wimifarma-tarefa-app:3500
      -> proxy /xp/ para wimifarma-xp-app:3600
      -> proxy /codigos/ para wimifarma-codigos-app:3700
      -> proxy /miauw/agent/ para wimifarma-miauw-agent:3100
      -> proxy /miauw/whatsapp/ para wimifarma-miauw-whatsapp:3400
  -> wimifarma-com-db:3306 (MySQL)
  -> wimifarma-cotacao-db:5432 (Postgres)
  -> wimifarma-cotacao-redis:6379 (Redis)
  -> wimifarma-gestao-db:5432 (Postgres)
  -> wimifarma-tarefa-db:5432 (Postgres)
  -> wimifarma-xp-db:5432 (Postgres)
  -> wimifarma-codigos-db:5432 (Postgres)
  -> wimifarma-financeiro-db:5432 (Postgres sombra)
  -> wimifarma-miauw-whatsapp-db:5432 (Postgres)
```

Arquivos principais:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`
- `ops/evolution/docker-compose.yml`
- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg`
- `apps/cotacao/public/favicon.svg`
- `apps/gestao/src/server.ts`
- `apps/gestao/public/`
- `apps/pedidos/src/server.ts`
- `apps/tarefa/src/server.ts`
- `apps/xp/src/server.ts`
- `apps/codigos/src/server.ts`
- `apps/financeiro/src/server.ts`
- `apps/tarefa/public/`
- `docker/mysql/init/01-create-databases.sql`
- `site/.htaccess`
- `site/home.php`
- `site/wp-config.php`
- `site/cashback/config.php`
- `site/codigos/` (legado/assets; rota oficial usa `apps/codigos`)
- `site/xp/` (legado/assets/uploads; rota oficial usa `apps/xp`)
- `site/gestao/` (legado; rota oficial usa `apps/gestao`)
- `.env.example`

Containers:

- `wimifarma-com-web`: PHP 8.3 + Apache, monta `./site:/var/www/html`.
- `wimifarma-com-db`: MySQL 8.0, monta `./mysql:/var/lib/mysql`.
- `wimifarma-cotacao-app`: Node.js 22 + Express + Socket.IO para `/cotacao/`.
- `wimifarma-cotacao-db`: Postgres 17, monta `./cotacao-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-cotacao-redis`: Redis 7, monta `./cotacao-data/redis:/data`.
- `wimifarma-gestao-app`: Node.js 22 + TypeScript + Express para `/gestao/`.
- `wimifarma-gestao-db`: Postgres 17, monta `./gestao-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-pedidos-app`: Node.js 22 + TypeScript + Express para `/pedidos/`, usando o Postgres da Gestao.
- `wimifarma-tarefa-app`: Node.js 22 + TypeScript + Express para `/tarefa/`.
- `wimifarma-tarefa-db`: Postgres 17, monta `./tarefa-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-xp-app`: Node.js 22 + TypeScript + Express para `/xp/`.
- `wimifarma-xp-db`: Postgres 17, monta `./xp-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-codigos-app`: Node.js 22 + TypeScript + Express para `/codigos/`.
- `wimifarma-codigos-db`: Postgres 17, monta `./codigos-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-financeiro-app`: Node.js 22 + TypeScript + Express em modo sombra para `/financeiro/health` e `/financeiro/internal/*`; a rota oficial `/financeiro/` continua PHP.
- `wimifarma-financeiro-db`: Postgres 17, monta `./financeiro-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-miauw-agent`: Node.js 22 + TypeScript + Agents SDK para `/miauw/agent/` em sombra/corte controlado.
- `wimifarma-miauw-whatsapp`: Node.js 22 + TypeScript para `/miauw/whatsapp/`, recebendo webhooks da Evolution API ou Meta Cloud API, exibindo painel operacional seguro e processando fila/outbox.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal WhatsApp do Miauby, monta `./miauw-whatsapp-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-evolution-api`: Evolution API v2 como transporte WhatsApp, em stack separada no VPS, ligada na rede `wimifarma-com-network` para o bridge chamar internamente.
- `wimifarma-evolution-postgres` e `wimifarma-evolution-redis`: persistencia propria da Evolution API, fora dos bancos do Wimifarma.

Rede Docker:

- `wimifarma-com-network`

## Portas e ambientes

- Docker interno: `wimifarma-com-web:80`
- Local Compose: `127.0.0.1:3002`
- Tunel PuTTY usado no Windows: `127.0.0.1:13002`
- Publico: `80/443` pelo Nginx Proxy Manager
- Nginx Proxy Manager admin observado no VPS: porta `81`
- Interno Cotacao V2: `wimifarma-cotacao-app:3000`
- Interno Gestao: `wimifarma-gestao-app:3200`
- Interno Pedidos: `wimifarma-pedidos-app:3300`
- Interno Tarefa: `wimifarma-tarefa-app:3500`
- Interno XP: `wimifarma-xp-app:3600`
- Interno Codigos: `wimifarma-codigos-app:3700`
- Interno Financeiro sombra: `wimifarma-financeiro-app:3800`
- Interno Miauby agente: `wimifarma-miauw-agent:3100`
- Interno Miauby WhatsApp: `wimifarma-miauw-whatsapp:3400`
- Interno Evolution API para o bridge: `wimifarma-evolution-api:8080`

O proxy publico deve encaminhar para `http://wimifarma-com-web:80`. Nao apontar o Nginx Proxy Manager diretamente para `wimifarma-cotacao-app`; o Apache ja publica `/cotacao/` e `/cotacao/socket.io/`.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-gestao-app`; o Apache publica `/gestao/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-pedidos-app`, `wimifarma-tarefa-app`, `wimifarma-xp-app`, `wimifarma-codigos-app` ou `wimifarma-financeiro-app`; o Apache publica `/pedidos/`, `/tarefa/`, `/xp/` e `/codigos/` internamente, enquanto o Financeiro Node fica apenas em sombra sem proxy publico.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-miauw-agent`; o Apache publica `/miauw/agent/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-miauw-whatsapp` nem para `wimifarma-evolution-api`; o Apache publica `/miauw/whatsapp/` internamente, e a Evolution API fica limitada a localhost/rede Docker ate decisao explicita.

## Regras que precisam ser preservadas

- Nao publicar o MySQL para a internet.
- Nao mudar a porta `3002` sem atualizar docs, proxy local e comandos de auditoria.
- Nao configurar Nginx Proxy Manager apontando para `127.0.0.1:13002`; essa porta e apenas tunel local.
- Manter `mysql/` como volume persistente e ignorado pelo Git.
- Manter `cotacao-data/` como volume persistente e ignorado pelo Git.
- Manter `gestao-data/` como volume persistente e ignorado pelo Git.
- Manter `tarefa-data/` como volume persistente e ignorado pelo Git.
- Manter `xp-data/` como volume persistente e ignorado pelo Git.
- Manter `codigos-data/` como volume persistente e ignorado pelo Git.
- Manter `financeiro-data/` como volume persistente e ignorado pelo Git.
- Manter `miauw-whatsapp-data/` como volume persistente e ignorado pelo Git.
- Manter a Cotacao V2 em `/cotacao/` sem gatilhos escondidos por palavra de categoria.
- Manter a Gestao oficial em `/gestao/` via Node/Postgres; `site/gestao` e apenas legado/fallback historico.
- Manter `Pedidos` como modulo separado em `/pedidos/`, usando `apps/pedidos`, container `wimifarma-pedidos-app:3300`, sessao propria `WFPEDIDOS`, CSRF proprio e proxy Apache dedicado. A URL antiga `/gestao/pedidos` deve apenas redirecionar para `/pedidos/`.
- Manter `Tarefa` como modulo separado em `/tarefa/`, usando `apps/tarefa`, container `wimifarma-tarefa-app:3500`, sessao propria `WFTAREFA`, CSRF proprio e proxy Apache dedicado. `site/tarefa` fica legado/fallback historico.
- Manter o XP como modulo proprio em `/xp/`, usando `apps/xp`, container `wimifarma-xp-app:3600`, Postgres dedicado, sessao propria `WFXP`, CSRF proprio e proxy Apache dedicado; `site/xp` fica legado/assets/uploads.
- Manter Codigos como modulo proprio em `/codigos/`, usando `apps/codigos`, container `wimifarma-codigos-app:3700`, Postgres dedicado, sessao propria `WFCODIGOS`, CSRF proprio e proxy Apache dedicado; `site/codigos` fica legado/assets.
- Manter `/financeiro/` no PHP enquanto `apps/financeiro` estiver em sombra; qualquer corte para `wimifarma-financeiro-app:3800` exige paridade por checksum, login/sessao equivalentes, fluxo de caixa/relatorio repetido e rollback documentado.
- Para futuras telas/cards com dominio proprio, escolher explicitamente o melhor desenho tecnico antes de implementar: linguagem/runtime, banco, schema, indices, permissoes, auditoria, healthcheck, deploy e integracoes. Preferir rota/app/servico separados em vez de transformar a Gestao em concentrador de subviews.
- Cada modulo novo deve declarar sua fonte de verdade. Quando precisar alimentar outro dominio, integrar por tabelas/APIs estruturadas, nao por acoplamento visual ou reaproveitamento de tela.
- Manter o Miauby agente sem escrita real; quando `MIAUW_ENGINE=node`, liberar primeiro apenas usuarios configurados e preservar rollback imediato para `php`.
- Manter o Miauby WhatsApp como borda de transporte: Evolution API ou Meta Cloud API nao viram motor de IA, banco oficial nem executor de escrita forte. O servico usa Postgres dedicado, allowlist, dedupe, painel seguro e outbox; o repositorio fica desligado por padrao e cada ambiente liga por `.env`.

## Decisoes tecnicas ja tomadas

- PHP/Apache foi escolhido por compatibilidade com WordPress e modulos PHP migrados.
- MySQL 8.0 foi usado para manter compatibilidade com dados importados.
- `.dockerignore` reduz contexto de build para evitar enviar dados sensiveis e volume MySQL ao Docker.
- Cache de pagina WordPress/SpeedyCache fica desligado por padrao durante a migracao. Em hosts publicos, so deve ser ativado com `WIMIFARMA_PUBLIC_PAGE_CACHE=true` depois que HTTPS e assets estiverem validados.
- A rota publica `/` e servida por `site/home.php` via `.htaccess`, sem carregar WordPress, para estabilizar a primeira tela enquanto plugins/cache/tema do WordPress sao investigados.
- A logo oficial da marca fica versionada como SVG horizontal nos assets compartilhados dos modulos; a atualizacao de 2026-05-21 usa os mesmos nomes de arquivo para preservar rotas e cache controlado. A home publica usa uma variacao animada propria e sem fundo em `assets/img/logo-wimifarma-home-animated.gif`, sem substituir os SVGs dos modulos internos.
- A Cotacao V2 foi separada em servico Node.js para permitir WebSocket, Postgres, Redis e evolucao mais proxima do Google Sheets sem continuar remendando a planilha PHP antiga.
- A Gestao foi separada em servico Node.js + TypeScript com Postgres dedicado porque e modulo administrativo critico; o login principal usa o core Postgres `core_users`, e MySQL permanece apenas para fallback temporario `wf_users`, espelho `wf_logs` e importacao unica do legado.
- Pedidos de fornecedores foi separado da Gestao em `apps/pedidos`, mas continua usando as tabelas financeiras `gestao_accounts`, `gestao_account_items` e `gestao_account_payments` para alimentar automaticamente os totais/categoria `Boleto` e reaproveitar o historico financeiro existente. A parte operacional fica em `pedidos_orders` e `pedidos_confirmed_orders`; vencimentos individuais de parcelas ficam em `gestao_account_items.due_at`, e `gestao_accounts.due_at` guarda a menor data ativa para resumo/ordenacao.
- Tarefa foi separado em `apps/tarefa` com Node.js + TypeScript e Postgres dedicado `wimifarma_tarefa`. A tela visual foi preservada, `wf_tarefas` e importado de forma idempotente e pode receber espelho temporario de novas escritas para rollback curto.
- XP foi migrado para `apps/xp` com Node.js + TypeScript e Postgres dedicado `wimifarma_xp`. A tela visual foi preservada por assets/uploads de `site/xp`, `wf_xp_*` e importado de forma idempotente e pode receber espelho temporario de novas escritas para rollback curto.
- Codigos foi migrado para `apps/codigos` com Node.js + TypeScript e Postgres dedicado `wimifarma_codigos`. A tela visual foi preservada por assets de `site/codigos`, `wf_codigos_*` e importado de forma idempotente e pode receber espelho temporario de novas escritas para rollback curto.
- Financeiro iniciou sombra em `apps/financeiro` com Node.js + TypeScript e Postgres dedicado `wimifarma_financeiro`. A tela PHP continua oficial; o app novo importa `financeiro_*` de forma idempotente e expoe health/resumo/checksums internos para validar a futura troca.
- O criterio para banco novo e: tabelas do dominio com FKs/constraints, dinheiro em centavos inteiros quando houver valor financeiro, indices em filtros/joins frequentes, indices parciais para filas/status, soft delete/arquivamento logico quando houver auditoria e migracao/compatibilidade documentada quando substituir tabela antiga.
- A Fase 7/8/9 do Miauby cria um servico Node.js 22 + TypeScript com Agents SDK, adaptador PHP de comparacao e corte por `MIAUW_ENGINE`. O PHP continua dono de login, sessoes, widget, confirmacoes, registry e auditoria.
- A Fase 17 do Miauby mantem o PHP como dono de treino/revisao e envia ao Node apenas contexto aprovado, versionado e compilado por relevancia; o servico agente continua sem credencial de banco e sem escrita direta.
- A Fase 19 do Miauby adiciona audio estilo WhatsApp no chat e no widget com botao explicito. O PHP transcreve o audio temporario no servidor para nao expor chave ao navegador; o audio nao e persistido, o texto fica revisavel antes do envio e voz nao executa escrita operacional direta.
- Palavras de categoria como `geral`, `urgente`, `encomenda` e `cotacao` nao devem aplicar cor, prioridade, ordem, filtro nem data operacional automaticamente; cor vem apenas de regra condicional explicita em `cotacao_v2_rules`.
- Em 2026-05-14, a Cotacao PHP antiga em `site/cotacao` e os shims de compatibilidade da raiz foram removidos. Os ativos usados por `/cotacao/` ficam versionados em `apps/cotacao/public`, e o Compose nao monta mais nada de `site/cotacao` no container Node.

## Riscos ao alterar

- Trocar nomes dos containers quebra referencias de rede e Nginx Proxy Manager.
- Alterar `site/wp-config.php` pode quebrar WordPress e redirects.
- Reativar cache de pagina antes de limpar `advanced-cache.php` e caches antigos pode servir HTML velho com assets `http://`.
- Remover a regra de `site/home.php` antes de validar a home WordPress pode trazer de volta a tela publica sem CSS/estrutura.
- Recriar o volume `mysql/` sem backup perde dados importados.
- Recriar `cotacao-data/` sem backup perde dados da Cotacao V2.
- Recriar `gestao-data/` sem backup perde contas, itens, pagamentos, auditoria e sessoes da Gestao.
- Recriar `tarefa-data/` sem backup perde tarefas, auditoria e sessoes do Tarefa Node/Postgres.
- Recriar `xp-data/` sem backup perde funcionarios, vendas, configuracoes, auditoria e sessoes do XP Node/Postgres.
- Recriar `codigos-data/` sem backup perde itens, blocos, auditoria e sessoes de Codigos Node/Postgres.
- Recriar `financeiro-data/` sem backup perde a copia sombra/checksum do Financeiro; enquanto o PHP seguir oficial, isso nao derruba a tela, mas perde validacao e historico de importacao.
- Trocar `/financeiro/` para Node antes da validacao pode afetar fechamentos, sangrias, PIX, maquininhas, relatorio e a integracao Pix CNPJ do Miauby WhatsApp.
- Reconstruir NPM sem conectar a rede `wimifarma-com-network` pode impedir o proxy de enxergar `wimifarma-com-web`.
- Recriar atalhos automaticos por nome de categoria na Cotacao pode conflitar com a formatacao condicional e causar saltos de linha/sync pesado.
- Alterar o proxy de `/cotacao/socket.io/` sem validar pode quebrar presenca e edicao ao vivo.
- Como nao existe mais fallback PHP legado para Cotacao, qualquer falha em `/cotacao/` deve ser tratada no proxy Apache/Node/Postgres/Redis da V2.
- A Gestao depende do proxy Apache para `wimifarma-gestao-app`; falhas em `/gestao/` devem ser diagnosticadas no Node, Postgres da Gestao, MySQL de login e proxy, nao no PHP legado.
- Tarefa depende do proxy Apache para `wimifarma-tarefa-app`; falhas em `/tarefa/` devem ser diagnosticadas no Node, Postgres da Tarefa, MySQL de login e proxy, nao no PHP legado.
- Trocar o chat do Miauby para o servico sombra sem evals/comparacoes pode perder confirmacoes, traces ou permissoes atuais.

## Pendencias

- Persistir a conexao do Nginx Proxy Manager a `wimifarma-com-network` em Compose/config do VPS, se ela ainda estiver manual.
- Finalizar SSL do dominio `wimifarma.com` quando DNS propagar.
- Definir se o deploy definitivo no VPS sera por Git na pasta atual ou clone limpo com migracao controlada dos dados locais.

## Evolucao futura

- Criar um arquivo de deploy separado para producao se as necessidades do VPS divergirem do local.
- Adicionar healthchecks no Compose.
- Criar rotinas de backup automatico do MySQL.
- Criar rotinas de backup automatico do Postgres da Cotacao V2.
- Separar jobs/cron em container proprio quando Miauby e sincronizacao crescerem.
- Evoluir a Cotacao V2 com conflito por campo, diagnostico de sync e import/export Google Sheets.
