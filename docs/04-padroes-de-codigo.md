# 04 - Padroes de codigo

## O que esta parte documenta

Este documento registra os padroes existentes para evitar mudancas grandes ou desalinhadas.

## Padroes encontrados

- PHP procedural.
- Um `bootstrap.php` por modulo quando necessario.
- Funcoes comuns em `site/cashback/functions.php`.
- Conexao PDO via helper `db()`.
- HTML escapado com helper `e()`.
- Sessao configurada em `site/cashback/config.php`.
- CSRF em formularios internos.
- Arquivos `app.js` e `styles.css` por modulo.
- Criacao/ajuste de tabelas por funcoes `*_ensure_schema()`.

## Arquivos envolvidos

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `site/financeiro/bootstrap.php`
- `site/financeiro/financeiro-funcoes.php`
- `site/tarefa/bootstrap.php`
- `site/tarefa/tarefa-funcoes.php`
- `site/miauw/bootstrap.php`
- `site/miauw/miauw-funcoes.php`

## Regras de negocio que precisam ser preservadas

- Helpers comuns nao devem mudar comportamento sem testar todos os modulos.
- Alteracoes de banco precisam preservar dados importados.
- Campos de auditoria devem continuar registrando usuario, acao, registro e data quando existirem.
- Cotacao deve preservar estado visual e ordem.
- Financeiro deve preservar justificativas e divergencias.

## Decisoes tecnicas ja tomadas

- Nao foi adotado framework PHP nesta fase para evitar reescrita durante a migracao.
- O codigo segue estrutura simples por pasta/modulo.
- O WordPress continua como raiz principal.
- Segredos entram por ambiente ou `config.local.php`.

## Padroes para novas alteracoes

- Preferir funcoes pequenas e claras.
- Reusar `db()`, `e()`, `csrf_token()`, `verify_csrf()` e helpers existentes.
- Usar PDO/prepared statements para SQL.
- Evitar SQL montado com interpolacao de entrada do usuario.
- Validar entrada de `$_GET`, `$_POST` e JSON antes de usar.
- Manter CSS/JS do modulo dentro da propria pasta.
- Atualizar docs no mesmo commit da mudanca.
- Criar novas abstracoes apenas quando reduzirem complexidade real.

## Riscos ao alterar

- Refatoracao ampla pode quebrar comportamento migrado que ainda nao tem testes.
- Criacao automatica de schema pode esconder problemas de migracao.
- Alterar arquivos de WordPress core dificulta atualizacoes futuras.
- Misturar responsabilidades entre modulos dificulta evolucao.

## Pendencias

- Definir padrao de migracoes.
- Definir padrao de testes.
- Documentar endpoints de API.
- Melhorar separacao entre regras de negocio, view e acesso a dados quando a base estabilizar.

## Evolucao futura

- Criar camada de servicos por modulo sem reescrever tudo.
- Isolar APIs internas em endpoints consistentes.
- Adicionar testes de regressao antes de refatoracoes maiores.
- Criar padrao para jobs/cron.
