# 09 - Deploy e ambiente

## O que esta parte do sistema faz

Documenta como o projeto roda no local e no VPS, incluindo Docker, proxy, DNS, portas e cuidados de deploy.

## Ambientes conhecidos

Local Windows:

- Pasta: `C:\Projetos\wimifarma-com`
- Acesso: `http://127.0.0.1:3002/`
- Docker Desktop

VPS Ubuntu/Oracle:

- Pasta oficial do projeto: `/home/ubuntu/projetos/wimifarma-com`
- Acesso por terminal: PuTTY
- Acesso automatizado do Codex: SSH/plink com chave local autorizada, para executar deploy diretamente e relatar o resultado sem mandar comando PuTTY equivalente ao usuario.
- Arquivos: WinSCP
- Proxy: Nginx Proxy Manager
- IP publico usado no DNS: `146.181.58.208`

Higiene de pastas no VPS:

- A pasta oficial e unica para deploy deve ser `/home/ubuntu/projetos/wimifarma-com`.
- Copias criadas durante migracao, como `wimifarma-com-git`, `wimifarma-com-code-*` ou `wimifarma-com-runti*`, devem ser tratadas como temporarias ate auditoria.
- Antes de mover qualquer pasta, conferir se ela nao e a origem montada nos containers atuais, se nao guarda `.env`, `mysql/`, `cotacao-data/`, backups ou `config.local.php` unicos.
- Pastas paradas devem ser movidas para uma quarentena de arquivo, como `/home/ubuntu/projetos/_arquivados-wimifarma/AAAA-MM-DD/`, e nao apagadas diretamente.
- Depois da organizacao, o WinSCP deve mostrar a operacao ativa concentrada em `wimifarma-com`, com copias antigas guardadas dentro de `_arquivados-wimifarma`.
- Em 2026-05-16, durante deploy do Miauby, o `wimifarma-com-db` foi encontrado em restart porque o `mysql/` oficial estava incompleto e sem `ibdata1`. O diretorio invalido foi movido para `/home/ubuntu/projetos/wimifarma-com/mysql-invalid-20260516113246`, e o `mysql/` oficial foi restaurado de `/home/ubuntu/projetos/wimifarma-com-runtime-disabled-2026-05-14-170039/mysql`. Preservar ambos ate decisao explicita.

## Arquivos e servicos envolvidos

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `apps/cotacao/`
- `apps/gestao/`
- `.env`
- `.env.example`
- `site/wp-config.php`
- `site/.htaccess`
- `site/home.php`
- `site/wp-content/mu-plugins/wimifarma-public-https.php`
- `site/wp-content/themes/wimifarma-cashback-theme/functions.php`
- `site/wp-content/themes/wimifarma-cashback-theme/header.php`
- `site/wp-content/themes/wimifarma-cashback-theme/front-page.php`
- `site/wp-content/advanced-cache.php`
- `site/wp-content/endurance-page-cache/`
- `site/wp-content/cache/`
- `site/wp-content/speedycache-config/`
- `cotacao-data/`
- `gestao-data/`
- Nginx Proxy Manager externo a este repositorio
- GoDaddy DNS externo a este repositorio

## Portas

- `wimifarma-com-web:80`: porta interna correta para o proxy Docker.
- `wimifarma-cotacao-app:3000`: servico interno da Cotacao V2, acessado pelo Apache por proxy reverso em `/cotacao`.
- `wimifarma-gestao-app:3200`: servico interno da Gestao, acessado pelo Apache por proxy reverso em `/gestao`.
- `wimifarma-miauw-agent:3100`: servico interno do Miauby agente em modo sombra/corte controlado, acessado pelo Apache por proxy reverso em `/miauw/agent`.
- `127.0.0.1:3002`: porta local publicada pelo Compose.
- `127.0.0.1:13002`: tunel PuTTY usado em testes.
- `80/443`: publico via Nginx Proxy Manager.
- `81`: painel Nginx Proxy Manager observado no VPS.

## Regras que precisam ser preservadas

- Nao expor MySQL publicamente.
- Nao usar porta de tunel no proxy publico.
- Manter o Nginx Proxy Manager enviando `X-Forwarded-Proto: https` para o Apache.
- Manter `site/wp-config.php` reconhecendo HTTPS atras do proxy para evitar CSS/JS com `http://`.
- Para hosts publicos `wimifarma.com` e `www.wimifarma.com`, manter `site/wp-config.php` forcando HTTPS e canonicalizando `WP_HOME`/`WP_SITEURL` para `https://wimifarma.com`.
- Manter `site/wp-content/mu-plugins/wimifarma-public-https.php` ativo para normalizar URLs publicas de tema/plugins para `https://wimifarma.com`.
- Manter a camada de normalizacao HTTPS no tema `wimifarma-cashback-theme`, porque a home depende do tema e pode continuar quebrada se algum arquivo runtime impedir o MU plugin de atuar.
- Manter cache de pagina WordPress/SpeedyCache desligado por padrao durante a migracao.
- Em hosts publicos, ativar page cache somente com `WIMIFARMA_PUBLIC_PAGE_CACHE=true` depois que o HTML publico nao contiver assets `http://wimifarma.com/...`.
- Quando aparecer home sem CSS/JS por mixed content, limpar ou mover `advanced-cache.php`, `cache/` e `speedycache-config/` antes de culpar tema ou proxy.
- Manter `site/.htaccess` redirecionando HTTP publico para HTTPS sem afetar `127.0.0.1:3002`.
- Manter `site/.htaccess` servindo `/` por `site/home.php` enquanto a home WordPress nao estiver validada em producao.
- `site/home.php` deve responder com header `X-Served-By: wimifarma-static-home`; se esse header nao aparecer no VPS, o proxy/container provavelmente nao esta servindo esta versao.
- `https://wimifarma.com/home.php` nao pode retornar 404 depois do deploy; se retornar, o commit com `site/home.php` nao chegou ao destino publico ou o proxy aponta para outra copia.
- `site/wp-content/endurance-page-cache/` e cache legado de HostGator e nao deve ser versionado nem preservado como fonte da home.
- Manter `docker/php/Dockerfile` com `AllowOverride All` para que o Apache leia `site/.htaccess`.
- Manter o proxy Apache de `/cotacao/` para `wimifarma-cotacao-app:3000`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter o proxy Apache de `/gestao/` para `wimifarma-gestao-app:3200`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter o proxy Apache de `/miauw/agent/` para `wimifarma-miauw-agent:3100`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter `.env` local em cada ambiente.
- Manter a pasta oficial do VPS como `/home/ubuntu/projetos/wimifarma-com`; nao voltar a operar a partir de clones temporarios depois da consolidacao.
- Definir `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET` no `.env` de cada ambiente antes de subir a Cotacao V2.
- Definir `GESTAO_POSTGRES_PASSWORD` e `GESTAO_SESSION_SECRET` no `.env` de cada ambiente antes de subir a Gestao Node/Postgres.
- Para backup/restore da Cotacao V2, manter `COTACAO_BACKUP_DIR=/app/backups` e o volume `./cotacao-data/backups:/app/backups`.
- Para Google Sheets, configurar `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_RANGE` e credencial em `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`.
- A senha operacional para excluir tabelas inteiras em Codigos e `wimifarma` por padrao e pode ser trocada por `CODIGOS_GROUP_DELETE_PASSWORD` no `.env` de cada ambiente.
- Para o Miauby agente sombra, definir `MIAUW_AGENT_INTERNAL_TOKEN` ou manter `MIAUW_GUARDIAN_TOKEN` como fallback; o endpoint publico de health nao exige token, mas `run` e `stream` internos exigem.
- Para comparar o PHP com o Miauby agente sombra em envios reais, ligar `MIAUW_AGENT_SHADOW_ON_SEND=true`; manter `false` por padrao para nao adicionar latencia no chat operacional.
- Para corte acelerado do Miauby, definir `MIAUW_ENGINE=node_shadow` ou `MIAUW_ENGINE=node`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm`, `MIAUW_MAINTENANCE_MODE=true` e `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`. Rollback: `MIAUW_ENGINE=php` e reiniciar `wimifarma-com-web`.
- Para audio do Miauby, manter `MIAUW_OPENAI_API_KEY` somente no `.env`, usar `MIAUW_AUDIO_ENABLED=true` e `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`. O botao depende de HTTPS/navegador com microfone e o PHP transcreve o audio temporario sem expor chave no browser; `MIAUW_REALTIME_MODEL`/`MIAUW_REALTIME_VOICE` ficam reservados para evolucao futura de playback/voz.
- Antes de deploy, fazer commit e push da alteracao. Por regra operacional atual, toda alteracao de arquivo deve ser commitada, enviada ao GitHub e publicada no VPS quando houver deploy aplicavel, salvo pedido explicito para nao publicar ou bloqueio tecnico relatado.
- Depois de deploy, rodar `docker compose ps`, logs dos servicos alterados e validar healths aplicaveis, como `http://127.0.0.1:3002/cotacao/health` e `http://127.0.0.1:3002/gestao/health`.
- Quando o Codex estiver conduzindo o deploy, ele deve executar os comandos no VPS e informar comandos/validacoes realizados, sem precisar orientar o usuario a abrir PuTTY.

## Decisoes tecnicas ja tomadas

- Deploy deve ser rastreavel por Git quando o VPS estiver preparado.
- DNS deve ser gerenciado na GoDaddy.
- Nginx Proxy Manager deve concentrar SSL e dominios.
- O Compose atual publica web apenas em `127.0.0.1:3002`.
- WordPress precisa tratar `X-Forwarded-Proto: https` como HTTPS real, porque o Apache recebe HTTP interno do proxy.
- O WordPress tambem forca HTTPS para `wimifarma.com` e `www.wimifarma.com`, define `WP_CONTENT_URL` publico e usa um MU plugin para corrigir URLs que plugins/tema emitam como `http://`.
- O redirect HTTP -> HTTPS tambem fica protegido por `.htaccess` para cobrir casos em que o Force SSL do proxy nao aplicar como esperado.
- A raiz `/` e roteada para `site/home.php`, uma home independente do WordPress com CSS embutido, para evitar que cache/plugin/tema antigo quebre a primeira tela publica durante a migracao.
- O Apache do container habilita `AllowOverride All` em `/var/www/html` para permitir regras do WordPress e redirects do projeto.
- `WP_CACHE` e `advanced-cache.php` ficam opt-in durante a migracao. Em `wimifarma.com`/`www.wimifarma.com`, `site/wp-config.php` ignora `WP_CACHE=true` e so permite cache de pagina se `WIMIFARMA_PUBLIC_PAGE_CACHE=true`.
- O tema `wimifarma-cashback-theme` tambem normaliza URLs publicas para HTTPS, gera assets da home com helper proprio e usa buffer de saida no frontend publico como segunda camada contra mixed content.
- A Cotacao V2 roda fora do PHP/WordPress: Apache faz proxy de `/cotacao/` para Node, Node usa Postgres para dados vivos e Redis para sessoes/presenca.
- A Gestao roda fora do PHP/WordPress: Apache faz proxy de `/gestao/` para Node, Node usa Postgres para contas, pagamentos, auditoria e sessoes, e MySQL somente para login/logs/importacao legado.
- Backups manuais da Cotacao V2 ficam em `cotacao-data/backups`, fora do Git.
- A Fase 7/8/9/10/11/12/13/14/15/16/17/18/19 do Miauby adiciona `wimifarma-miauw-agent`, o adaptador PHP sombra, o corte por `MIAUW_ENGINE`, o contrato versionado de personalidade, contratos de tools enviados do PHP ao Node, ponte PHP de tools, roteador de estilo/memoria aprovada, treinador, perfis de voz e audio por transcricao confirmada. O deploy de mudancas no servico deve rebuildar `wimifarma-miauw-agent` e `wimifarma-com-web`; mudancas so no adaptador PHP podem rebuildar apenas `wimifarma-com-web`.

## Riscos ao alterar

- Fazer `git clone` por cima da pasta atual pode apagar volume/dados locais.
- Mover ou apagar uma pasta que ainda esteja montada por container ativo pode tirar o site do ar. Conferir mounts com `docker inspect` antes de arquivar.
- Arquivar uma pasta sem preservar `.env`, `mysql/`, `cotacao-data/` ou `config.local.php` pode perder configuracao ou dados locais unicos.
- Se o MySQL do VPS entrar em restart com `Failed to find valid data directory`, nao recriar volume vazio. Conferir se existe `ibdata1` no `mysql/` oficial e procurar copias preservadas antes de qualquer acao.
- Trocar nomes de container quebra proxy.
- Remover o proxy Apache de `/cotacao/` derruba a Cotacao oficial, porque nao existe mais fallback PHP legado.
- Remover o proxy Apache de `/gestao/` derruba a Gestao oficial; `site/gestao` nao deve ser tratado como fonte oficial depois da migracao Node/Postgres.
- Remover o proxy Apache de `/miauw/agent/` nao derruba o chat PHP atual quando `MIAUW_ENGINE=php`, mas impede validar o agente Node do Miauby e quebra o motor `node`.
- Trocar DNS antes do app estar saudavel derruba o site.
- Ativar SSL forcado antes do certificado funcionar bloqueia acesso.
- Se o WordPress nao reconhecer HTTPS atras do proxy, ele gera assets `http://` e o navegador bloqueia CSS/JS por mixed content.
- Uma regra de HTTPS sem considerar `X-Forwarded-Proto` pode criar loop infinito atras do proxy.
- Se `AllowOverride` ficar desativado, o `.htaccess` sera ignorado e `http://wimifarma.com` podera continuar respondendo 200.
- Remover a canonicalizacao publica em `wp-config.php` pode fazer `www.wimifarma.com` ou assets do tema voltarem para `http://`.
- Remover o MU plugin de HTTPS publico pode permitir que plugins antigos voltem a emitir assets inseguros.
- Remover a normalizacao HTTPS do tema pode quebrar a home mesmo que outras rotas continuem funcionando.
- `advanced-cache.php` do SpeedyCache roda antes dos MU plugins quando `WP_CACHE` esta ligado; ele pode servir uma home antiga com URLs `http://` mesmo que o resto do WordPress ja esteja corrigido.
- Se `X-Served-By: wimifarma-static-home` nao aparecer na rota `/`, nao investigar CSS primeiro; validar `git log`, rebuild do container e destino do Nginx Proxy Manager.
- Se a rota publica ainda mostrar `wfwc-home-launchpad`, validar tambem se `site/wp-content/endurance-page-cache/` foi removido/ignorado no deploy.
- Apagar `cotacao-data/` remove dados da Cotacao V2. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `gestao-data/` remove contas, itens, pagamentos, auditoria e sessoes da Gestao. Fazer backup antes de qualquer limpeza ou troca de volume.
- Configurar credencial Google Sheets errada pode fazer import/export falhar ou atingir a planilha errada. Validar sempre com `/cotacao/api/google-sheets/status`.

## Pendencias

- Consolidar o VPS para operar somente em `/home/ubuntu/projetos/wimifarma-com` e arquivar copias antigas depois de auditoria de mounts/dados.
- Confirmar propagacao DNS definitiva nos principais resolvedores.
- Validar certificado Let's Encrypt para `wimifarma.com` e `www.wimifarma.com` apos cada mudanca de proxy.
- Validar se o HTML publico gera assets com `https://`.
- Validar no VPS que `/` responde por `site/home.php` antes de mexer novamente no tema WordPress.
- Remover caches runtime antigos do VPS para uma pasta de quarentena depois de backup/validacao.
- Limpar cache runtime do SpeedyCache no VPS apos o deploy da correcao de HTTPS/cache.
- Criar rotina de rollback.
- Criar rotina agendada e externa de backup para `cotacao-data/postgres` e `cotacao-data/backups` antes de colocar dados reais na Cotacao V2.
- Criar rotina agendada e externa de backup para `gestao-data/postgres` antes de uso amplo da Gestao administrativa.
- Criar checklist de corte progressivo por tool para liberar usuarios alem de `adm` depois dos evals e traces reais.

## Evolucao futura

- Criar script de deploy.
- Criar backup automatico antes de `docker compose up -d --build`.
- Separar Compose local/producao se as configuracoes divergirem.
- Adicionar monitoramento de uptime e validade SSL.
