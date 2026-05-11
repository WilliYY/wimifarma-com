# 09 - Deploy e ambiente

## O que esta parte do sistema faz

Documenta como o projeto roda no local e no VPS, incluindo Docker, proxy, DNS, portas e cuidados de deploy.

## Ambientes conhecidos

Local Windows:

- Pasta: `C:\Projetos\wimifarma-com`
- Acesso: `http://127.0.0.1:3002/`
- Docker Desktop

VPS Ubuntu/Oracle:

- Pasta observada: `/home/ubuntu/projetos/wimifarma-com`
- Acesso por terminal: PuTTY
- Arquivos: WinSCP
- Proxy: Nginx Proxy Manager
- IP publico usado no DNS: `146.181.58.208`

## Arquivos e servicos envolvidos

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `.env`
- `.env.example`
- `site/wp-config.php`
- `site/wp-content/mu-plugins/wimifarma-public-https.php`
- Nginx Proxy Manager externo a este repositorio
- GoDaddy DNS externo a este repositorio

## Portas

- `wimifarma-com-web:80`: porta interna correta para o proxy Docker.
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
- Manter `site/.htaccess` redirecionando HTTP publico para HTTPS sem afetar `127.0.0.1:3002`.
- Manter `docker/php/Dockerfile` com `AllowOverride All` para que o Apache leia `site/.htaccess`.
- Manter `.env` local em cada ambiente.
- Antes de deploy, fazer commit e push da alteracao.
- Depois de deploy, rodar `docker compose ps` e logs.

## Decisoes tecnicas ja tomadas

- Deploy deve ser rastreavel por Git quando o VPS estiver preparado.
- DNS deve ser gerenciado na GoDaddy.
- Nginx Proxy Manager deve concentrar SSL e dominios.
- O Compose atual publica web apenas em `127.0.0.1:3002`.
- WordPress precisa tratar `X-Forwarded-Proto: https` como HTTPS real, porque o Apache recebe HTTP interno do proxy.
- O WordPress tambem forca HTTPS para `wimifarma.com` e `www.wimifarma.com`, define `WP_CONTENT_URL` publico e usa um MU plugin para corrigir URLs que plugins/tema emitam como `http://`.
- O redirect HTTP -> HTTPS tambem fica protegido por `.htaccess` para cobrir casos em que o Force SSL do proxy nao aplicar como esperado.
- O Apache do container habilita `AllowOverride All` em `/var/www/html` para permitir regras do WordPress e redirects do projeto.

## Riscos ao alterar

- Fazer `git clone` por cima da pasta atual pode apagar volume/dados locais.
- Trocar nomes de container quebra proxy.
- Trocar DNS antes do app estar saudavel derruba o site.
- Ativar SSL forcado antes do certificado funcionar bloqueia acesso.
- Se o WordPress nao reconhecer HTTPS atras do proxy, ele gera assets `http://` e o navegador bloqueia CSS/JS por mixed content.
- Uma regra de HTTPS sem considerar `X-Forwarded-Proto` pode criar loop infinito atras do proxy.
- Se `AllowOverride` ficar desativado, o `.htaccess` sera ignorado e `http://wimifarma.com` podera continuar respondendo 200.
- Remover a canonicalizacao publica em `wp-config.php` pode fazer `www.wimifarma.com` ou assets do tema voltarem para `http://`.
- Remover o MU plugin de HTTPS publico pode permitir que plugins antigos voltem a emitir assets inseguros.

## Pendencias

- Decidir e executar migracao segura da pasta do VPS para Git.
- Confirmar propagacao DNS definitiva nos principais resolvedores.
- Validar certificado Let's Encrypt para `wimifarma.com` e `www.wimifarma.com` apos cada mudanca de proxy.
- Validar se o HTML publico gera assets com `https://`.
- Criar rotina de rollback.

## Evolucao futura

- Criar script de deploy.
- Criar backup automatico antes de `docker compose up -d --build`.
- Separar Compose local/producao se as configuracoes divergirem.
- Adicionar monitoramento de uptime e validade SSL.
