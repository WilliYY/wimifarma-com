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
- Modulos criticos novos podem usar Node.js + TypeScript + Postgres dedicado, mantendo o Apache como proxy e o MySQL apenas para autenticacao/logs quando for o padrao do projeto.
- Integracoes externas com webhook/fila, como Miauby WhatsApp, devem preferir servico dedicado e Postgres proprio quando precisarem de idempotencia, outbox, retry e isolamento de dados.

## Arquivos envolvidos

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/codigos/bootstrap.php`
- `site/codigos/api.php`
- `site/codigos/codigos-funcoes.php`
- `site/xp/bootstrap.php`
- `site/xp/xp-funcoes.php`
- `site/xp/index.php`
- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/gestao/src/server.ts`
- `apps/gestao/public/app.js`
- `apps/gestao/public/styles.css`
- `apps/tarefa/src/server.ts`
- `apps/tarefa/public/app.js`
- `apps/tarefa/public/styles.css`
- `apps/miauw-whatsapp/src/server.ts`
- `site/financeiro/bootstrap.php`
- `site/financeiro/financeiro-funcoes.php`
- `site/gestao/bootstrap.php` (legado)
- `site/gestao/gestao-funcoes.php` (legado)
- `site/tarefa/bootstrap.php` (legado)
- `site/tarefa/tarefa-funcoes.php` (legado)
- `site/miauw/bootstrap.php`
- `site/miauw/miauw-funcoes.php`

## Regras de negocio que precisam ser preservadas

- Helpers comuns nao devem mudar comportamento sem testar todos os modulos.
- Alteracoes de banco precisam preservar dados importados.
- Campos de auditoria devem continuar registrando usuario, acao, registro e data quando existirem.
- Cotacao deve preservar estado visual e ordem.
- Financeiro deve preservar justificativas e divergencias.
- Gestao deve preservar conta, itens, pagamentos, auditoria e saldos em centavos, sem apagar historico.
- XP deve preservar vendas em centavos, XP em inteiro, fotos validadas, remocao logica e logs de alimentacao.

## Decisoes tecnicas ja tomadas

- Nao foi adotado framework PHP nesta fase para evitar reescrita durante a migracao.
- O codigo segue estrutura simples por pasta/modulo.
- O WordPress continua como raiz principal.
- Segredos entram por ambiente ou `config.local.php`.
- A Gestao adotou Node.js + TypeScript + Postgres por ser modulo administrativo critico e estar no inicio, permitindo schema versionado, sessoes isoladas e evolucao mais segura.
- A Tarefa adotou Node.js + TypeScript + Postgres dedicado para remover o primeiro modulo PHP pequeno do MySQL operacional, mantendo a tela visual e um espelho MySQL temporario para rollback curto.
- O Miauby WhatsApp adotou Node.js + TypeScript + Postgres dedicado para webhook/fila/outbox, evitando misturar eventos externos com MySQL legado ou com o banco da Gestao.
- O XP adotou PHP procedural + MySQL por ser modulo interno manual, sem colaboracao em tempo real nem necessidade de runtime novo.

## Padroes para novas alteracoes

- Preferir funcoes pequenas e claras.
- Reusar `db()`, `e()`, `csrf_token()`, `verify_csrf()` e helpers existentes.
- Usar PDO/prepared statements para SQL.
- Evitar SQL montado com interpolacao de entrada do usuario.
- Validar entrada de `$_GET`, `$_POST` e JSON antes de usar.
- Endpoints JSON internos, como `/codigos/api.php`, devem reutilizar sessao, CSRF e prepared statements dos helpers existentes.
- Manter CSS/JS do modulo dentro da propria pasta.
- Uploads de novos modulos devem validar erro, tamanho, MIME real por imagem, extensao controlada, dimensoes minimas/maximas, nome aleatorio e pasta com execucao de script bloqueada.
- Em modulos administrativos manuais, manter dados principais e itens/pagamentos com total derivado, status reversivel e historico preservado.
- Em `apps/gestao`, salvar dinheiro em centavos inteiros, usar queries parametrizadas, criar indices por padrao de acesso, manter sessoes em Postgres e evitar dependencia direta de tabelas MySQL fora de `wf_users`/`wf_logs`/importacao legado.
- Em `apps/tarefa`, preservar a interface visual, status/prioridades existentes, CSRF, sessao `WFTAREFA`, health/badge e importacao idempotente de `wf_tarefas`.
- Em `apps/miauw-whatsapp`, manter payload externo sanitizado, dedupe por provider/instancia/message id, hash/mascara/cifra para identificadores, indices parciais de fila e nenhuma escrita forte direta pelo WhatsApp.
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
