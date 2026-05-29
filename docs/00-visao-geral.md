# 00 - Visao geral

## O que esta parte documenta

Este documento e a visao geral do projeto Wimifarma. Ele deve ajudar humanos e agentes a entenderem rapidamente o que existe, o que esta em migracao e onde procurar mais detalhes.

## O que o sistema faz

O projeto combina o site WordPress da Wimifarma com ferramentas internas para operacao:

- Cashback: clientes, compras, creditos, resgates, atendentes, configuracoes e mensagens.
- Codigos: atalhos de itens com comissao diferente, com codigo, EAN e preco editaveis em autosave.
- Cotacao: itens, fornecedores, categorias, precos, status, formatacao e auditoria.
- Financeiro: fechamentos, sangrias, PIX, maquininhas, lancamentos e auditoria.
- Usuarios: logins individuais, permissoes por modulo, vinculo com XP e historico central.
- Gestao: contas a pagar manuais, itens de composicao, pagamentos parciais e total pago por mes.
- XP: cadastro de atendentes, foto, venda diaria, pontos e progressao visual de niveis.
- Tarefas: tarefas simples internas em Node.js/TypeScript com Postgres dedicado.
- Miauby: assistente interno com memoria, alertas, diagnostico, camada online e rotinas de Farmacia Popular; possui servico agente com modo sombra/corte controlado por `MIAUW_ENGINE`, personalidade versionada, contratos de tools enviados do PHP para o Node e tools reais por ponte PHP interna, sem liberar escrita direta.
- Miauby WhatsApp: bridge dedicado em Node.js/TypeScript com Postgres proprio, webhook da Evolution API ou Meta Cloud API, fila, dedupe, allowlist, painel operacional e outbox, publicado em `/miauw/whatsapp/`; o repositorio fica desligado por padrao e cada ambiente liga por `.env`.
- WordPress: site principal e conteudo publico.

## Arquivos, rotas e componentes envolvidos

- Entrada web: `site/`
- WordPress: `site/wp-admin`, `site/wp-content`, `site/wp-includes`, `site/wp-config.php`
- Cashback: `apps/cashback/`, publicado em `/cashback/` por proxy interno do Apache; `site/cashback/` preserva assets e helpers PHP ainda chamados pelo Miauby.
- Codigos: `apps/codigos/`, publicado em `/codigos/` por proxy interno do Apache; `site/codigos/` fica somente com assets e o PHP antigo esta em `site/_legacy-disabled/2026-05-29/codigos-php/`.
- Cotacao V2: `apps/cotacao/`, publicada em `/cotacao/` por proxy interno do Apache
- Financeiro: `apps/financeiro/`, publicado em `/financeiro/` por proxy interno do Apache; `site/financeiro/` fica como legado/assets.
- Usuarios: `apps/usuarios/`, publicado em `/usuarios/` por proxy interno do Apache, usando o Postgres core.
- Gestao: `apps/gestao/`, publicada em `/gestao/` por proxy interno do Apache; o PHP antigo esta em `site/_legacy-disabled/2026-05-29/gestao/`.
- XP: `apps/xp/`, publicado em `/xp/` por proxy interno do Apache; `site/xp/` fica somente com assets/uploads e o PHP antigo esta em `site/_legacy-disabled/2026-05-29/xp-php/`.
- Tarefas: `apps/tarefa/`, publicada em `/tarefa/` por proxy interno do Apache; `site/tarefa/` fica como legado.
- Miauby: `site/miauw/`
- Miauby agente: `apps/miauw-agent/`, publicado em `/miauw/agent/` por proxy interno do Apache
- Miauby WhatsApp: `apps/miauw-whatsapp/`, publicado em `/miauw/whatsapp/` por proxy interno do Apache
- Evolution API: template em `ops/evolution/`, deploy separado no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`
- Docker: `docker-compose.yml`, `docker/php/Dockerfile`
- Banco: volume local `mysql/` ignorado pelo Git
- Documentacao: `README.md`, `AGENTS.md`, `docs/`
- Quarentena de legado desativado: `site/_legacy-disabled/`, bloqueada por `.htaccess`

Rotas principais:

- `/`
- `/wp-login.php`
- `/cashback/login.php`
- `/codigos/login.php`
- `/codigos/health`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/usuarios/login.php`
- `/usuarios/health`
- `/gestao/login.php`
- `/gestao/health`
- `/xp/login.php`
- `/xp/health`
- `/tarefa/login.php`
- `/tarefa/health`
- `/miauw/login.php`
- `/miauw/widget-status.php`
- `/miauw/agent/health`
- `/miauw/whatsapp/`
- `/miauw/whatsapp/health`

## Regras de negocio que precisam ser preservadas

- O Cashback depende de clientes, compras, creditos e resgates coerentes entre si.
- Codigos de comissao devem preservar codigo, EAN, preco e historico basico por logs; a tela separa os EANs em blocos por prefixo de dois digitos, com `20` e `40` como padrao e botao `+` para criar outros blocos persistidos no backend, e a exclusao deve esconder o item sem apagar o registro fisico imediatamente.
- Cotacao deve preservar ordem, categorias, fornecedores, precos, observacoes, cores/formatacao e status.
- Financeiro deve preservar auditoria e rastreabilidade de fechamentos e divergencias; o Postgres oficial mantem espelho MySQL temporario para rollback curto.
- Usuarios deve preservar auditoria central, nunca apagar fisicamente login interno e aplicar permissoes por modulo de forma gradual.
- Gestao deve preservar contas lancadas, itens que compoem o total, categoria livre, pagamentos parciais datados, data de geracao automatica, confirmacao de saldo e logs/auditoria sem apagar historico.
- XP deve preservar funcionarios, fotos validadas, vendas em centavos, XP inteiro, logs de alimentacao e progressao por total historico sem apagar lancamentos; cancelamentos devem ser logicos.
- Miauby deve operar sem expor chaves, tokens ou dados sensiveis em logs publicos.
- O servico Miauby agente nao deve executar escrita real. O adaptador PHP compara respostas por trace e o corte inicial fica limitado a usuarios liberados por `MIAUW_ENGINE`, com rollback por `.env`.
- O bridge WhatsApp do Miauby deve manter Evolution API ou Meta Cloud API como transporte, usar allowlist, bloquear grupos por padrao, guardar apenas metadados sanitizados/hash/mascara/cifra no Postgres dedicado, exibir no painel apenas dados seguros e nao executar escrita forte diretamente pelo WhatsApp.
- WordPress deve continuar servindo o site principal enquanto os modulos internos ficam acessiveis por suas rotas.

## Decisoes tecnicas ja tomadas

- A aplicacao roda em Docker, com PHP/Apache separado do MySQL.
- O banco foi dividido em `wimifarma_wp` para WordPress e `wimifarma_app` para ferramentas internas.
- Segredos ficam fora do Git em `.env` e `config.local.php`.
- O repositorio deve ser tratado como publico ate decisao contraria.
- O Nginx Proxy Manager deve encaminhar o dominio publico para `wimifarma-com-web:80`, nao para a porta de tunel.
- A Cotacao PHP antiga foi removida; a fonte oficial de `/cotacao/` e `apps/cotacao`.
- Em 2026-05-29, legados comprovadamente inativos foram movidos para `site/_legacy-disabled/2026-05-29/`; detalhes e cuidados ficam em `docs/27-limpeza-legado.md`.
- A Gestao critica foi separada em `apps/gestao` com Node.js, TypeScript e Postgres dedicado; o login principal usa o core Postgres, e o MySQL continua apenas como fallback temporario, logs/espelho e legado importado.
- O XP foi migrado para `apps/xp` com Node.js, TypeScript e Postgres dedicado, mantendo somente frontend/assets/uploads de `site/xp` e rollback por flags legadas.
- Codigos foi migrado para `apps/codigos` com Node.js, TypeScript e Postgres dedicado, mantendo somente frontend/assets de `site/codigos` e rollback por flags legadas.
- Financeiro foi cortado para `apps/financeiro` com Node.js, TypeScript e Postgres dedicado, mantendo espelho MySQL temporario para rollback curto.
- Usuarios foi criado em `apps/usuarios` com Node.js, TypeScript e Postgres core para administrar logins, permissoes por modulo, vinculo XP e auditoria central.
- O Miauby agente dedicado foi iniciado em `apps/miauw-agent`; `site/miauw/api.php` continua dono de sessao, confirmacoes e escritas fortes mesmo quando `MIAUW_ENGINE=node`.
- O Miauby WhatsApp foi iniciado em `apps/miauw-whatsapp` com Postgres 17 dedicado porque o canal precisa de fila duravel, idempotencia e outbox auditavel.
- A Evolution API fica fora da stack principal do Wimifarma, como transporte separado, com Postgres/Redis/instancias proprios e API acessivel internamente pelo bridge. A Meta Cloud API usa o mesmo bridge por `MIAUW_WHATSAPP_PROVIDER=meta`, sem stack extra no VPS.

## Riscos ao alterar

- Misturar portas de tunel, porta local e porta interna Docker pode quebrar proxy e WordPress.
- Alterar WordPress/cache/plugins sem teste pode reintroduzir lentidao ou redirect errado.
- Alterar schema automaticamente sem controle pode impactar dados importados do HostGator.
- Remover o espelho/rollback do Financeiro antes da validacao operacional pode dificultar recuperacao de fechamento e PIX CNPJ.
- Aplicar bloqueio por permissao em todos os modulos de uma vez pode travar a equipe; usar `/usuarios/` como base e cortar modulo por modulo.
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
