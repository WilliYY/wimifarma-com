# 01 - Arquitetura

## O que esta parte do sistema faz

A arquitetura atual empacota o sistema migrado do HostGator em Docker. O container web serve WordPress, modulos PHP internos e faz proxy para Cotacao V2, Gestao e Miauby agente; os dados ficam separados entre MySQL legado/apps, Postgres da Cotacao V2, Postgres da Gestao e Redis de sessoes/presenca.

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
      -> proxy /miauw/agent/ para wimifarma-miauw-agent:3100
  -> wimifarma-com-db:3306 (MySQL)
  -> wimifarma-cotacao-db:5432 (Postgres)
  -> wimifarma-cotacao-redis:6379 (Redis)
  -> wimifarma-gestao-db:5432 (Postgres)
```

Arquivos principais:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `apps/miauw-agent/src/server.ts`
- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg`
- `apps/cotacao/public/favicon.svg`
- `apps/gestao/src/server.ts`
- `apps/gestao/public/`
- `docker/mysql/init/01-create-databases.sql`
- `site/.htaccess`
- `site/home.php`
- `site/wp-config.php`
- `site/cashback/config.php`
- `site/codigos/`
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
- `wimifarma-miauw-agent`: Node.js 22 + TypeScript + Agents SDK para `/miauw/agent/` em sombra/corte controlado.

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
- Interno Miauby agente: `wimifarma-miauw-agent:3100`

O proxy publico deve encaminhar para `http://wimifarma-com-web:80`. Nao apontar o Nginx Proxy Manager diretamente para `wimifarma-cotacao-app`; o Apache ja publica `/cotacao/` e `/cotacao/socket.io/`.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-gestao-app`; o Apache publica `/gestao/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-miauw-agent`; o Apache publica `/miauw/agent/` internamente.

## Regras que precisam ser preservadas

- Nao publicar o MySQL para a internet.
- Nao mudar a porta `3002` sem atualizar docs, proxy local e comandos de auditoria.
- Nao configurar Nginx Proxy Manager apontando para `127.0.0.1:13002`; essa porta e apenas tunel local.
- Manter `mysql/` como volume persistente e ignorado pelo Git.
- Manter `cotacao-data/` como volume persistente e ignorado pelo Git.
- Manter `gestao-data/` como volume persistente e ignorado pelo Git.
- Manter a Cotacao V2 em `/cotacao/` sem gatilhos escondidos por palavra de categoria.
- Manter a Gestao oficial em `/gestao/` via Node/Postgres; `site/gestao` e apenas legado/fallback historico.
- Manter `Pedidos` como modulo separado em `/pedidos/`, usando `apps/pedidos`, container `wimifarma-pedidos-app:3300`, sessao propria `WFPEDIDOS`, CSRF proprio e proxy Apache dedicado. A URL antiga `/gestao/pedidos` deve apenas redirecionar para `/pedidos/`.
- Para futuras telas/cards com dominio proprio, escolher explicitamente o melhor desenho tecnico antes de implementar: linguagem/runtime, banco, schema, indices, permissoes, auditoria, healthcheck, deploy e integracoes. Preferir rota/app/servico separados em vez de transformar a Gestao em concentrador de subviews.
- Cada modulo novo deve declarar sua fonte de verdade. Quando precisar alimentar outro dominio, integrar por tabelas/APIs estruturadas, nao por acoplamento visual ou reaproveitamento de tela.
- Manter o Miauby agente sem escrita real; quando `MIAUW_ENGINE=node`, liberar primeiro apenas usuarios configurados e preservar rollback imediato para `php`.

## Decisoes tecnicas ja tomadas

- PHP/Apache foi escolhido por compatibilidade com WordPress e modulos PHP migrados.
- MySQL 8.0 foi usado para manter compatibilidade com dados importados.
- `.dockerignore` reduz contexto de build para evitar enviar dados sensiveis e volume MySQL ao Docker.
- Cache de pagina WordPress/SpeedyCache fica desligado por padrao durante a migracao. Em hosts publicos, so deve ser ativado com `WIMIFARMA_PUBLIC_PAGE_CACHE=true` depois que HTTPS e assets estiverem validados.
- A rota publica `/` e servida por `site/home.php` via `.htaccess`, sem carregar WordPress, para estabilizar a primeira tela enquanto plugins/cache/tema do WordPress sao investigados.
- A Cotacao V2 foi separada em servico Node.js para permitir WebSocket, Postgres, Redis e evolucao mais proxima do Google Sheets sem continuar remendando a planilha PHP antiga.
- A Gestao foi separada em servico Node.js + TypeScript com Postgres dedicado porque e modulo administrativo critico; MySQL permanece para `wf_users`, `wf_logs` e importacao unica do legado.
- Pedidos de fornecedores foi separado da Gestao em `apps/pedidos`, mas continua usando as tabelas financeiras `gestao_accounts`, `gestao_account_items` e `gestao_account_payments` para alimentar automaticamente os totais/categoria `Boleto` e reaproveitar o historico financeiro existente. A parte operacional fica em `pedidos_orders` e `pedidos_confirmed_orders`.
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
- Reconstruir NPM sem conectar a rede `wimifarma-com-network` pode impedir o proxy de enxergar `wimifarma-com-web`.
- Recriar atalhos automaticos por nome de categoria na Cotacao pode conflitar com a formatacao condicional e causar saltos de linha/sync pesado.
- Alterar o proxy de `/cotacao/socket.io/` sem validar pode quebrar presenca e edicao ao vivo.
- Como nao existe mais fallback PHP legado para Cotacao, qualquer falha em `/cotacao/` deve ser tratada no proxy Apache/Node/Postgres/Redis da V2.
- A Gestao depende do proxy Apache para `wimifarma-gestao-app`; falhas em `/gestao/` devem ser diagnosticadas no Node, Postgres da Gestao, MySQL de login e proxy, nao no PHP legado.
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
