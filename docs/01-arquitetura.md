# 01 - Arquitetura

## O que esta parte do sistema faz

A arquitetura atual empacota o sistema migrado do HostGator em Docker. O container web serve WordPress e modulos PHP internos; o container de banco guarda WordPress e dados dos apps internos.

## Componentes envolvidos

```text
Usuario/Navegador
  -> DNS GoDaddy
  -> VPS Oracle/Ubuntu
  -> Nginx Proxy Manager (80/443)
  -> wimifarma-com-web:80 (Apache/PHP)
  -> wimifarma-com-db:3306 (MySQL)
```

Arquivos principais:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `docker/mysql/init/01-create-databases.sql`
- `site/wp-config.php`
- `site/cashback/config.php`
- `.env.example`

Containers:

- `wimifarma-com-web`: PHP 8.3 + Apache, monta `./site:/var/www/html`.
- `wimifarma-com-db`: MySQL 8.0, monta `./mysql:/var/lib/mysql`.

Rede Docker:

- `wimifarma-com-network`

## Portas e ambientes

- Docker interno: `wimifarma-com-web:80`
- Local Compose: `127.0.0.1:3002`
- Tunel PuTTY usado no Windows: `127.0.0.1:13002`
- Publico: `80/443` pelo Nginx Proxy Manager
- Nginx Proxy Manager admin observado no VPS: porta `81`

O proxy publico deve encaminhar para `http://wimifarma-com-web:80`.

## Regras que precisam ser preservadas

- Nao publicar o MySQL para a internet.
- Nao mudar a porta `3002` sem atualizar docs, proxy local e comandos de auditoria.
- Nao configurar Nginx Proxy Manager apontando para `127.0.0.1:13002`; essa porta e apenas tunel local.
- Manter `mysql/` como volume persistente e ignorado pelo Git.

## Decisoes tecnicas ja tomadas

- PHP/Apache foi escolhido por compatibilidade com WordPress e modulos PHP migrados.
- MySQL 8.0 foi usado para manter compatibilidade com dados importados.
- `.dockerignore` reduz contexto de build para evitar enviar dados sensiveis e volume MySQL ao Docker.
- `WP_CACHE` pode ser desligado por padrao em localhost para evitar travamento local com cache restaurado.

## Riscos ao alterar

- Trocar nomes dos containers quebra referencias de rede e Nginx Proxy Manager.
- Alterar `site/wp-config.php` pode quebrar WordPress e redirects.
- Recriar o volume `mysql/` sem backup perde dados importados.
- Reconstruir NPM sem conectar a rede `wimifarma-com-network` pode impedir o proxy de enxergar `wimifarma-com-web`.

## Pendencias

- Persistir a conexao do Nginx Proxy Manager a `wimifarma-com-network` em Compose/config do VPS, se ela ainda estiver manual.
- Finalizar SSL do dominio `wimifarma.com` quando DNS propagar.
- Definir se o deploy definitivo no VPS sera por Git na pasta atual ou clone limpo com migracao controlada dos dados locais.

## Evolucao futura

- Criar um arquivo de deploy separado para producao se as necessidades do VPS divergirem do local.
- Adicionar healthchecks no Compose.
- Criar rotinas de backup automatico do MySQL.
- Separar jobs/cron em container proprio quando Miauby e sincronizacao crescerem.
