# 00 - Visao geral

## O que esta parte documenta

Este documento e a visao geral do projeto Wimifarma. Ele deve ajudar humanos e agentes a entenderem rapidamente o que existe, o que esta em migracao e onde procurar mais detalhes.

## O que o sistema faz

O projeto combina o site WordPress da Wimifarma com ferramentas internas para operacao:

- Cashback: clientes, compras, creditos, resgates, atendentes, configuracoes e mensagens.
- Codigos: atalhos de itens com comissao diferente, com codigo, EAN e preco editaveis em autosave.
- Cotacao: itens, fornecedores, categorias, precos, status, formatacao e auditoria.
- Financeiro: fechamentos, sangrias, PIX, maquininhas, lancamentos e auditoria.
- Gestao: contas a pagar manuais, itens de composicao, pagamentos parciais e total pago por mes.
- Tarefas: tarefas simples internas.
- Miauby: assistente interno com memoria, alertas, diagnostico, camada online e rotinas de Farmacia Popular; a Fase 13 possui servico agente com modo sombra/corte controlado por `MIAUW_ENGINE`, personalidade versionada, contratos de tools enviados do PHP para o Node e tools reais de leitura baixa por ponte PHP interna, sem liberar escrita direta.
- WordPress: site principal e conteudo publico.

## Arquivos, rotas e componentes envolvidos

- Entrada web: `site/`
- WordPress: `site/wp-admin`, `site/wp-content`, `site/wp-includes`, `site/wp-config.php`
- Cashback: `site/cashback/`
- Codigos: `site/codigos/`
- Cotacao V2: `apps/cotacao/`, publicada em `/cotacao/` por proxy interno do Apache
- Financeiro: `site/financeiro/`
- Gestao: `apps/gestao/`, publicada em `/gestao/` por proxy interno do Apache; `site/gestao/` fica como legado.
- Tarefas: `site/tarefa/`
- Miauby: `site/miauw/`
- Miauby agente: `apps/miauw-agent/`, publicado em `/miauw/agent/` por proxy interno do Apache
- Docker: `docker-compose.yml`, `docker/php/Dockerfile`
- Banco: volume local `mysql/` ignorado pelo Git
- Documentacao: `README.md`, `AGENTS.md`, `docs/`

Rotas principais:

- `/`
- `/wp-login.php`
- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/gestao/login.php`
- `/gestao/health`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/widget-status.php`
- `/miauw/agent/health`

## Regras de negocio que precisam ser preservadas

- O Cashback depende de clientes, compras, creditos e resgates coerentes entre si.
- Codigos de comissao devem preservar codigo, EAN, preco e historico basico por logs; a tela separa os EANs em blocos por prefixo de dois digitos, com `20` e `40` como padrao e botao `+` para criar outros blocos persistidos no backend, e a exclusao deve esconder o item sem apagar o registro fisico imediatamente.
- Cotacao deve preservar ordem, categorias, fornecedores, precos, observacoes, cores/formatacao e status.
- Financeiro deve preservar auditoria e rastreabilidade de fechamentos e divergencias.
- Gestao deve preservar contas lancadas, itens que compoem o total, categoria livre, pagamentos parciais datados, data de geracao automatica, confirmacao de saldo e logs/auditoria sem apagar historico.
- Miauby deve operar sem expor chaves, tokens ou dados sensiveis em logs publicos.
- O servico Miauby agente nao deve executar escrita real. O adaptador PHP compara respostas por trace e o corte inicial fica limitado a usuarios liberados por `MIAUW_ENGINE`, com rollback por `.env`.
- WordPress deve continuar servindo o site principal enquanto os modulos internos ficam acessiveis por suas rotas.

## Decisoes tecnicas ja tomadas

- A aplicacao roda em Docker, com PHP/Apache separado do MySQL.
- O banco foi dividido em `wimifarma_wp` para WordPress e `wimifarma_app` para ferramentas internas.
- Segredos ficam fora do Git em `.env` e `config.local.php`.
- O repositorio deve ser tratado como publico ate decisao contraria.
- O Nginx Proxy Manager deve encaminhar o dominio publico para `wimifarma-com-web:80`, nao para a porta de tunel.
- A Cotacao PHP antiga foi removida; a fonte oficial de `/cotacao/` e `apps/cotacao`.
- A Gestao critica foi separada em `apps/gestao` com Node.js, TypeScript e Postgres dedicado; o MySQL continua apenas para login interno, logs e legado importado.
- O Miauby agente dedicado foi iniciado em `apps/miauw-agent`; `site/miauw/api.php` continua dono de sessao, confirmacoes e escritas fortes mesmo quando `MIAUW_ENGINE=node`.

## Riscos ao alterar

- Misturar portas de tunel, porta local e porta interna Docker pode quebrar proxy e WordPress.
- Alterar WordPress/cache/plugins sem teste pode reintroduzir lentidao ou redirect errado.
- Alterar schema automaticamente sem controle pode impactar dados importados do HostGator.
- Versionar `.env`, dumps ou plugins premium pode expor segredos e licencas.

## Pendencias conhecidas

- Finalizar DNS/SSL de `wimifarma.com`.
- Corrigir URL publica final do WordPress apos DNS/SSL.
- Definir fluxo Git definitivo no VPS atual.
- Evoluir Cotacao com sincronizacao forte com Google Sheets.
- Criar suite de testes automatizada.

## Como pode evoluir

- Separar documentacao por modulo conforme eles crescerem.
- Criar docs especificos para regras de negocio, permissao, APIs e sincronizacao.
- Migrar criacao de tabelas para migracoes versionadas.
- Criar observabilidade padrao para logs, auditoria, jobs e erros.
