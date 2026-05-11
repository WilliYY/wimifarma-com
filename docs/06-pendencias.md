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

Risco:

- `wptl_options.home` e `siteurl` incorretos causam redirect para HostGator, tunel local ou HTTP.

Evolucao:

- Depois do SSL, ajustar `home` e `siteurl` para `https://wimifarma.com` de forma controlada.

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

### Cotacao + Google Sheets

Estado:

- Existem tabelas `cotacao_*` e `cotacao_sync_estado`.
- Nao ha integracao Google Sheets implementada.

Risco:

- Sincronizacao mal desenhada pode duplicar linhas, perder formatacao ou sobrescrever campos importantes.

Evolucao:

- Definir ID estavel por item, fonte de verdade por campo, tratamento de conflito, auditoria e job de sync.

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

Risco:

- A lentidao pode reaparecer no VPS Linux.

Evolucao:

- Medir tempos no VPS, revisar plugins/cache/tema, ativar cache apenas depois de HTTPS correto.

## Baixa prioridade

### Testes automatizados

Estado:

- Validacao atual e principalmente manual/curl/php lint.

Evolucao:

- Criar smoke tests para login/status e testes de integridade de banco.

### Documentar APIs endpoint por endpoint

Estado:

- Existem APIs em `site/cotacao/api.php`, `site/miauw/api.php`, `site/cashback/api-clientes.php` e outras.

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
