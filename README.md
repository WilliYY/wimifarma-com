# Wimifarma

Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle, com WordPress, modulos internos legados em PHP e modulos modernos em Node.js/TypeScript/Postgres rodando via Docker.

Estado base desta documentacao: 2026-05-10.

## Objetivo do sistema

O sistema centraliza a presenca web e ferramentas internas da Wimifarma:

- site WordPress principal em `site/`;
- Cashback para clientes, compras, creditos e resgates;
- Codigos para atalhos de itens com comissao diferente, com codigo, EAN e preco editaveis;
- Cotacao para controle de itens, fornecedores, precos e status de compras;
- Pedidos para recebimento de fornecedores, vencimento de boletos, pagamentos parciais e historico;
- Financeiro para fechamento, sangrias, PIX, maquininhas e rastreabilidade interna;
- Desde 2026-06-05, o Caixa do Financeiro mostra resumo por categoria e cards de lancamento mais legiveis, mantendo as mesmas regras de gravacao, autosave e integracao Miauby.
- Usuarios para logins individuais, permissoes por modulo, vinculo com XP e historico central;
- Login / Senha para cofre interno simples de acessos da farmacia, com aba restrita `Contas` para admin/gerente, senha cifrada e auditoria;
- Gestao para contas a pagar manuais, itens de composicao, pagamentos parciais, vencimentos, categorias livres e total pago por mes;
- XP para gamificar vendas dos atendentes com cadastro de funcionarios, fotos, pontos e niveis;
- Tarefas internas;
- Miauby, assistente interno com integracao OpenAI e recursos de diagnostico.
- Miauby Whatsapp para acompanhar canal, webhook, fila, outbox, Evolution API, Meta Cloud API e automacoes n8n de smoke/watchdog, chegada de pedidos e fechamento de caixa por endpoint interno tokenizado.

O objetivo tecnico da migracao e sair de uma hospedagem HostGator limitada e evoluir em uma VPS mais flexivel, com Docker, controle de versao, deploy rastreavel e espaco para novos modulos.

Para novos cards/modulos, a regra e escolher a melhor estrutura tecnica pelo dominio antes da tela: linguagem/runtime, banco, tabelas, indices, sessao, permissao, auditoria, health e deploy. Cards com regra de negocio propria devem nascer como modulo proprio e integrar outros dominios por tabelas/APIs claras, nao por mistura visual dentro de outro modulo.

Direcao futura registrada em 2026-05-30: o usuario quer usar Next.js e Prisma em evolucoes futuras. Eles nao fazem parte da stack atual e nao devem ser adicionados durante cortes sensiveis sem piloto isolado, validacao de frontend, plano de rollback e deploy documentado. Next.js e candidato para site publico novo ou modulo novo com interface rica; Prisma deve ser avaliado primeiro em modulo novo ou reescrita controlada, sem trocar os modulos Express/SQL ja estabilizados de uma vez.

## Status atual

- Projeto local em `C:\Users\Thiesen\Desktop\wimifarma-com`.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- Auditoria geral de 2026-06-02 e roadmap para finalizar a migracao 100% ficam em `docs/29-roadmap-final-migracao.md`. Os checks locais, audits npm, healths do VPS e readiness do Miauby passaram; os bloqueios finais sao Miauby interno, core-auth legado, migrador sombra do Miauby e decisao sobre WordPress/site publico.
- Docker Compose sobe `wimifarma-com-web`, `wimifarma-com-db`, `wimifarma-core-db`, `wimifarma-core-migrator`, `wimifarma-cashback-app`, `wimifarma-cashback-db`, `wimifarma-cotacao-app`, `wimifarma-cotacao-db`, `wimifarma-cotacao-redis`, `wimifarma-gestao-app`, `wimifarma-pedidos-app`, `wimifarma-tarefa-app`, `wimifarma-gestao-db`, `wimifarma-tarefa-db`, `wimifarma-xp-app`, `wimifarma-xp-db`, `wimifarma-codigos-app`, `wimifarma-codigos-db`, `wimifarma-financeiro-app`, `wimifarma-financeiro-db`, `wimifarma-usuarios-app`, `wimifarma-login-senha-app`, `wimifarma-login-senha-db`, `wimifarma-miauw-agent`, `wimifarma-miauw-whatsapp`, `wimifarma-miauw-whatsapp-db`, `wimifarma-miauby-db`, `wimifarma-miauby-migrator` e `wimifarma-miauby-app`.
- Banco local importado do HostGator no volume ignorado `mysql/`.
- `wimifarma_app` contem tabelas `wf_*`, `cotacao_*`, `financeiro_*`, legados `gestao_*` e `miauw_*`.
- `wimifarma_wp` contem WordPress com prefixo `wptl_`.
- O core compartilhado de autenticacao fica em Postgres `wimifarma_core`: `apps/core-auth` sincroniza `wf_users` para `core_users`, preservando id legado, hash, role e status. `apps/usuarios` usa esse mesmo core para criar logins novos, permissoes por modulo, vinculo com XP, vinculo seguro com allowlist do Miauby WhatsApp, cofre administrativo cifrado para senhas redefinidas pelo ADM e auditoria central. Cotacao, Gestao, Pedidos, Tarefa, Codigos, Cashback, XP, Financeiro e Usuarios usam esse core como login unico, sem dependencia MySQL; quando o operador ja passou pela home, eles podem aceitar o cookie assinado `WFHOME_SSO` apenas para criar uma sessao propria apos revalidar o usuario ativo e as permissoes no core.
- O modulo `Login / Senha` fica em `apps/login-senha`, publicado em `/login-senha/` por proxy Apache para `wimifarma-login-senha-app:3950`, com Postgres dedicado `wimifarma_login_senha`, sessao `WFLOGINSENHA`, permissao `login_senha` no core, senhas cifradas por AES-256-GCM e auditoria local/central. O cofre comum exige permissao explicita para usuario comum; o card separado `Login / Senha ADM` foi removido da Home em 2026-06-05, e o escopo administrativo foi reaproveitado como aba `Contas` no topo do proprio modulo, visivel apenas para `adm`, role `admin` ou role `gerente`. A auditoria de eventos recentes fica recolhida por padrao na tela para ocupar menos espaco, mas continua gravando os eventos normalmente. Arquivar um acesso tira da lista principal e envia para `Historico de senhas`; nesse historico, `Excluir` ou `Limpar historico` remove apenas acessos ja arquivados do cofre, preservando auditoria sem valor de senha. Desde 2026-06-08, a tela usa layout visual mais compacto e polido, com formulario destacado, tabela em linhas-card densas, editor expandido mais claro e responsividade ajustada, preservando CSRF, POSTs, reorder, reveal/copy, criptografia, arquivamento e auditoria.
- Desde 2026-06-05, `/login-senha/` mostra os acessos em tabela compacta tipo planilha, com Nome, Login / Usuario e Senha em destaque. Clicar na linha abre o painel de edicao do proprio acesso; o olho revela a senha via endpoint auditado, copiar senha continua auditado, a senha nao e enviada no HTML inicial e a ordem manual por arrastar fica salva em `sort_order`. Desde 2026-06-06, o historico de senhas arquivadas fica recolhido por padrao e nao permite revelar/copiar senha arquivada.
- A Cotacao V2 fica em `apps/cotacao`, usa Node.js/Express/Socket.IO, Postgres e Redis, e e publicada por proxy interno do Apache em `/cotacao/`. Em 2026-05-31, a migracao para TypeScript chegou a Fase 3.5 com helpers TS sombra e build paralelo `npm run build:ts` para `apps/cotacao/dist/`; nada disso altera runtime, frontend, rotas, Dockerfile ou deploy, e `npm start` continua `node src/server.js`. Desde 2026-06-01, a celula ativa tem autosave com debounce de 1,2 segundo usando o endpoint oficial de celula, status visual de alteracoes pendentes/salvando/salvo e aviso nativo ao fechar/recarregar com edicao suja ou save pendente. Desde 2026-06-02, importacao Google Sheets e restore de backup exigem `adm`/`admin`/`gerente` e reconciliam lembretes de encomenda para evitar pendencias faltantes ou antigas.
- Desde 2026-06-05, `Adicionar linha acima/abaixo` no menu de contexto da Cotacao usa a linha real do banco mesmo quando a tela esta filtrada; o evento Socket.IO leva as posicoes reais para os outros usuarios, e a linha vazia recem-criada fica visivel localmente para quem inseriu ate o filtro ser reaplicado.
- Desde 2026-06-05, o filtro `CATEGORIA` agrupa duplicidades visuais por uma chave local normalizada, sem alterar os valores antigos salvos no banco; aplicar a opcao unica encontra todas as linhas equivalentes.
- Desde 2026-06-06, edicoes recebidas por evento tambem mantem a linha visivel quando ela deixa de bater com o filtro atual, e eventos internos de lembrete de encomenda nao recarregam a planilha.
- O login da Cotacao usa somente `core_users` no Postgres do core; o app nao possui mais `mysql2`, pool MySQL nem fallback `wf_users`. Os dados novos da planilha ficam em Postgres no volume ignorado `cotacao-data/`.
- A Gestao fica oficialmente em `apps/gestao`, usa Node.js/TypeScript/Express com Postgres dedicado `wimifarma_gestao`, e e publicada por proxy interno do Apache em `/gestao/`; o login usa somente `core_users`, sem fallback `wf_users`, sem espelho `wf_logs`, sem `mysql2` e sem variaveis `MYSQL_*` no servico. A ponte Miauby -> Gestao tambem usa somente endpoints internos tokenizados e auditoria Postgres, sem `wf_logs` no contrato da tool `criar_conta_gestao`. A tela principal usa linhas compactas em `Categoria / Nome / Valor / Pagar`, abre detalhes ao clicar na linha inteira, coloca contas com repeticao ativa primeiro e mostra simbolo de repeticao nelas. Desde 2026-06-06, o `Pagar` compacto da lista principal registra o pagamento pelo fluxo existente sem abrir confirmacao nativa do navegador. O painel `Mensal` fica ao lado da lista principal, com as contas de repeticao ativa reordenaveis por arrastar; contas marcadas como `Repetir sempre mes que vem` ficam priorizadas no topo, continuam no painel mesmo pagas e garantem a proxima copia ao quitar sem duplicar pagamento. Ainda em 2026-06-06, os blocos `Nova conta`, `Contas abertas`, `Pedidos`, `Mensal`, `Categorias` e `Notas` ganharam separacao visual por acento/cor para leitura mais rapida, sem mudar escrita, banco ou integracoes. Desde 2026-06-08, o formulario `Nova conta` usa grid mais respiravel para competencia/status/vencimento e itens, evitando sobreposicao visual sem alterar entradas, POSTs, CSRF, banco ou integracoes.
- O Balcao do Cashback mostra `Gastar/Usar Cashback` em blocos de cliente, compra atual, resumo financeiro e acao para facilitar leitura, mantendo o mesmo POST `save_redeem`, CSRF, atendente travado pelo usuario logado e calculo automatico de uso/novo cashback.
- Desde 2026-06-08, o card `Gastar/Usar Cashback` recebeu o mesmo acabamento visual do cadastro: cabecalho destacado, blocos com acento, campos em caixas focadas, resumo financeiro colorido e botao principal mais forte, preservando `save_redeem`, CSRF, campos, calculo automatico e transacao Postgres.
- Desde 2026-06-07, os cards de clientes recentes/encontrados no Balcao do Cashback usam uma grade mais aberta, com ID, telefone, atendente e atualizado em chips, saldo centralizado e acoes alinhadas, para evitar texto espremido sem alterar busca, selecao, resgate ou historico.
- Desde 2026-06-08, o card `Novo cliente` do Balcao ficou mais refinado visualmente, com cabecalho destacado, blocos com acento, campos em caixas focadas, resumo financeiro colorido e microanimacoes leves, preservando o mesmo POST `save_client`, CSRF, campos e calculo de compra inicial.
- A tela `Mensagens` do Cashback mostra cards de WhatsApp pendentes com campanha, cliente, telefone/detalhe, mensagem completa e acoes; desde 2026-06-07, indicadores, abas, secoes e cards ficaram mais compactos para caber mais fila por tela. Desde 2026-06-08, os cards tambem usam acento por campanha, metadados de criacao/data e largura operacional maior, mantendo o mesmo backend. Abrir WhatsApp, copiar texto ou excluir atualiza o status salvo e remove o card da fila visual, sem apagar o historico.
- Em `/cashback/relatorio.php`, a area de atendentes usa cards compactos em grade normal, sem rolagem interna, com status visual e grid denso; a parte de acessos/exportacao usa filtro, metricas, cards CSV menores e acentos por bloco, mantendo os mesmos formularios, CSRF, POSTs, exclusao/inativacao, auditoria e exportacoes.
- Pedidos fica oficialmente em `apps/pedidos`, usa Node.js/TypeScript/Express, sessao propria `WFPEDIDOS` e rota/proxy separados em `/pedidos/`. Ele autentica somente em `core_users`, sem `mysql2`, pool MySQL, fallback `wf_users` ou variaveis `MYSQL_*` no Compose; as tabelas operacionais `pedidos_orders` e `pedidos_confirmed_orders` ficam no Postgres da Gestao para manter a integracao financeira com `Boleto`, permite editar fornecedor/valores/vencimentos por parcela com auditoria em Postgres e arquiva pedidos da tela sem apagar dados financeiros. Desde 2026-06-07, a coluna `Historico` abre compacta com 6 cards e revela mais 6 por vez pelo botao `Mostrar mais`, sem mudar banco, status, pagamentos ou auditoria. Desde 2026-06-03, `POST /pedidos/api/internal/create-order` permite criacao pelo Miauby Whats com token interno, `actor_user_id`, permissao core e idempotencia em `pedidos_internal_idempotency`; o bridge parseia variacoes reais de `miauby pedido`, fornecedor/valor/chegada/status/parcelas, pede confirmacao quando o total diverge da soma das parcelas e nao grava quando faltar dado ou houver status contraditorio. Ainda em 2026-06-03, `GET /pedidos/api/internal/cancel-candidates` e `POST /pedidos/api/internal/cancel-order` permitem ao Miauby WhatsApp e ao Miauby interno listar/cancelar apenas pedidos em `Aguardando chegada`, sempre revalidando permissao core, pedindo escolha quando houver varios parecidos, exigindo confirmacao humana e mantendo cancelamento/arquivamento logico sem apagar pagamentos ou historico financeiro.
- Desde 2026-06-06, os cards recolhidos de `Aguardando chegada` e `Confirmados` tambem mostram a data e horario em que o pedido/card foi criado, usando o `created_at` persistido, sem recalcular ou alterar status.
- Ainda em 2026-06-06, `/pedidos/` recebeu acabamento visual de frontend: indicadores superiores com cores por estado, formulario destacado, colunas operacionais com cabecalho sticky no desktop, cards com acento por status e microanimacoes CSS leves, mantendo os mesmos POSTs, CSRF, rotas, pagamentos, chegada, arquivamento logico, auditoria e banco.
- Desde 2026-06-08, `/pedidos/` usa fluxo natural no desktop para o formulario e as colunas operacionais, sem rolagem interna em `Novo pedido`, `Aguardando chegada` ou `Confirmados`; as lanes ficaram mais compactas, com borda/sombra propria, botao de registro melhor assentado e cards recolhidos mais densos, preservando todos os campos, POSTs, CSRF, pagamentos, status, auditoria e consultas Postgres.
- Tarefa fica oficialmente em `apps/tarefa`, usa Node.js/TypeScript/Express, sessao propria `WFTAREFA`, Postgres dedicado `wimifarma_tarefa` e rota/proxy separados em `/tarefa/`. A tela foi preservada visualmente; desde 2026-05-30 o servico autentica somente pelo core Postgres, sem `mysql2`, importador, espelho de logs, fallback `wf_users` ou flags `TAREFA_LEGACY_MYSQL_*`. Tarefas sem dono continuam publicas para todos; tarefas privadas usam `assigned_core_user_id`, aparecem somente para o usuario indicado, enquanto ADM/admin ve todas. Desde 2026-06-01, o proprio modulo Tarefas permite ao ADM selecionar o usuario de destino e agendar lembrete Miauby por WhatsApp em `tarefa_reminders`, com tentativas, resultado do bridge e auditoria; o card de criacao separa `Dia` e `Horario` com largura/quebra responsiva, preservando o mesmo `remind_at`. A visao ADM tambem mostra, por tarefa, um badge `Miauby Whats` com quantos envios foram confirmados e o ultimo envio/tentativa, lendo somente `tarefa_reminders`. Desde 2026-06-06, `/tarefa/` organiza melhor criacao, fila aberta, badges de prioridade/Miauby e historico recolhido por CSS, sem mudar formularios, endpoints, banco, CSRF, `remind_at` ou envio WhatsApp. Desde 2026-06-03, Miauby interno e Miauby WhatsApp usam endpoints internos de Tarefa para listar/consultar tarefas visiveis, criar tarefa privada para si, criar tarefa para outro usuario quando ADM/admin, criar tarefa geral quando ADM/admin e concluir/cancelar por texto apos confirmacao humana. No WhatsApp oficial com perfil `Farmacia`, tarefa sem destino pergunta para quem e lista usuarios mais `Geral/equipe`; tarefa com `para Thiago` cria privada para Thiago; concluir/cancelar tarefa escolhe primeiro o humano e depois segue a confirmacao normal. Comandos com data clara, como `amanha 15h` ou `sexta cedo`, viram `remind_at` para tarefa privada com usuario de destino; quando a busca por consultar/concluir/cancelar encontra varias tarefas, o Miauby lista opcoes agrupadas e guarda uma escolha curta por sessao/numero, aceitando `1`, ordinal, `a geral`, `adm 1`, `minha 2`, usuario ou trecho do titulo antes de consultar ou pedir SIM/NAO final. O endpoint interno de tarefa privada revalida o usuario ativo/com acesso no app Tarefa; se o dono de uma tarefa muda ou uma tarefa e concluida/cancelada, lembretes pendentes antigos sao cancelados ou recriados para nao avisar o usuario errado. Ainda em 2026-06-03, avisos automaticos de tarefa privada foram separados de lembretes manuais: ao criar/atribuir tarefa privada o Miauby avisa o usuario, agenda acompanhamento diario se a tarefa seguir aberta e mantem o lembrete manual para o dia/horario pedido, com `dedupe_key` no Tarefa e no bridge para bloquear repeticoes do mesmo envio.
- Desde 2026-06-08, os cards de `/tarefa/` ficaram mais compactos e legiveis: metadados de prioridade/privacidade/Miauby ficam em uma faixa lateral, o botao `Editar` virou um controle discreto em pill, a edicao aberta ocupa melhor a largura do card e as acoes `Concluir`/`Cancelar` ficam mais alinhadas, sem alterar formularios, CSRF, endpoints, banco, status ou worker de lembretes.
- A Cotacao PHP antiga foi removida; `site/cotacao` nao existe mais e os ativos da tela oficial ficam em `apps/cotacao/public`.
- Em 2026-05-29, a limpeza de legado arquivou PHPs e assets antigos comprovadamente inativos em `site/_legacy-disabled/2026-05-29/`, com acesso bloqueado por `.htaccess`. Foram preservados WordPress, Miauby PHP, helpers PHP ainda chamados pelo Miauby e assets montados pelos apps Node. Em 2026-05-31, `site/cashback`, `site/financeiro` e `site/tarefa` ganharam `.htaccess` local bloqueando execucao web direta de PHP para impedir que telas antigas ressurgam se o proxy oficial for alterado por engano; assets seguem liberados. Em 2026-06-04, as telas/APIs PHP antigas de `site/cashback` e o Financeiro PHP antigo foram movidos para `site/_legacy-disabled/2026-06-04/`, deixando nas pastas oficiais apenas assets e helpers minimos ainda necessarios ao Miauby. O inventario fica em `docs/27-limpeza-legado.md`.
- Em 2026-05-30, foi iniciado o inventario detalhado de Gestao, Pedidos, Tarefa, XP, Codigos, Usuarios e Cotacao em `docs/26-inventario-modulos.md`, e a trilha de migracao completa do Miauby interno em `docs/28-miauby-migracao.md`. `Miauby` passa a ser o nome canonico de produto, enquanto `miauw` continua como prefixo tecnico legado em rotas/env/tabelas durante a transicao. Ainda em 2026-05-30, `apps/miauby`, `wimifarma-miauby-db`, `wimifarma-miauby-migrator` e `wimifarma-miauby-app` passam a copiar `miauw_*` para `miauby_*` em Postgres sombra e expor API interna somente leitura de status/paridade, com payload sanitizado, sem alterar o frontend.
- Em 2026-05-31, foi iniciado o corte canonico seguro do Miauby: a home aponta o card `Miauby` para `/miauby/` e o card `Miauby Whatsapp` para `/miauby/whatsapp/`; o Apache publica aliases `/miauby/agent/` e `/miauby/whatsapp/` para os servicos Node existentes; e `site/.htaccess` redireciona `/miauby/` para `/miauw/` enquanto o motor PHP/MySQL do chat interno ainda nao foi substituido. Desde 2026-06-04, `/miauby/health` e alias publico limpo para o health minimo do agente em `/miauw/agent/health`, sem publicar o app sombra `wimifarma-miauby-app`. `/miauw/`, `/miauw/agent/` e `/miauw/whatsapp/` continuam funcionando como compatibilidade/rollback.
- Em 2026-05-31, a Fase 4 do Miauby foi ativada no VPS com `MIAUW_ENGINE=node_shadow`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e `MIAUW_AGENT_SHADOW_ON_SEND=false`: apenas `adm` compara Node sombra em envios reais, enquanto a resposta oficial continua PHP e usuarios comuns nao ganham latencia global.
- Em 2026-06-02, a migracao do Miauby interno avancou sem corte: `site/miauw` pode consultar o contexto canônico do `apps/miauby` em sombra por `MIAUBY_CONTEXT_SHADOW_ENABLED`, gravando apenas trace sanitizado com versoes/contagens. A Etapa 5A consolidou `canonical_read_model.version=miauby-read-model-5a-2026-06-02`, com persona, treino aprovado, memorias/padroes aprovados, conhecimentos ativos/aprovados e contratos de tools vindos do Node/Postgres, sem chamada OpenAI, sem executar tool e sem escrita. A Etapa 5B preparou um adaptador interno de escrita em `apps/miauby` com contratos tipados, plano de idempotencia, tabelas de intencao/auditoria criadas pelo migrador e endpoints tokenizados `/miauby/api/internal/write-adapter`, `/plan` e `/dry-run`. A Etapa 5C ligou o trilho de shadow write/dry-run controlado: se `MIAUBY_WRITE_SHADOW_ENABLED=true` no PHP e `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true` no `wimifarma-miauby-app`, mensagens ja gravadas oficialmente no MySQL sao enviadas como intencoes sanitizadas para `miauby_write_intents`/`miauby_write_audit_events`, com idempotencia e divergencia por checksum; por padrao tudo segue desligado. A resposta oficial continua PHP, `MIAUBY_WRITES_ENABLED=false` continua bloqueando escrita real, e `write_enabled`, `writes_enabled_in_node`, `route_cutover_enabled` e `public_proxy_enabled` continuam falsos por seguranca. Ainda em 2026-06-02, o runtime `wimifarma-miauby-app` deixou de receber/abrir MySQL; o app usa Postgres `wimifarma_miauby` e o ultimo `validate` salvo em `miauby_migration_runs` para readiness/paridade. MySQL fica apenas no `wimifarma-miauby-migrator`, executado manualmente para atualizar/validar a sombra.
- Ainda em 2026-06-02, a Etapa 6A preparou o corte controlado por usuario: `MIAUBY_ENGINE` e aceito como nome novo do motor (`php`, `node_shadow` ou `node`) com fallback para `MIAUW_ENGINE`; o runtime informa por usuario se a resposta oficial vem do Node ou do PHP, mantendo escrita oficial em PHP/MySQL, `/miauw/` como rota, `route_cutover_enabled=false`, `public_proxy_enabled=false` e fallback para PHP se o Node falhar. O primeiro corte seguro e apenas `adm`.
- Em 2026-06-03, a Etapa 6A foi ativada no VPS somente para `adm`: `MIAUBY_ENGINE=node`, `MIAUW_ENGINE=node` e `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm`. `adm` recebe resposta oficial do `wimifarma-miauw-agent`; usuarios fora da allowlist continuam com resposta PHP. A escrita oficial continua em `site/miauw` PHP/MySQL (`write_owner=php_mysql`), sem corte de rota/proxy publico e com fallback para PHP no mesmo request se o agent falhar.
- Em 2026-06-04, a Etapa 7A preparou a primeira escrita real controlada do Miauby interno em Postgres: o adaptador `/miauby/api/internal/write-adapter/commit` pode gravar apenas conversas e mensagens em `miauby_conversations`/`miauby_messages`, depois que o PHP ja gravou MySQL, e somente com `MIAUBY_WRITES_ENABLED=true` mais a flag especifica da operacao. O padrao seguro continua `/dry-run`; treino, memorias, alertas, diagnostico, rota publica e remocao de MySQL seguem bloqueados ate nova validacao.
- Rotas de login dos modulos responderam HTTP 200 na auditoria local.
- `miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava configurada.
- No widget do Miauby, `api_ready` indica chave preenchida, nao chamada OpenAI validada. Se o chat cair no fallback, conferir logs/alertas internos para autenticacao, cota, modelo ou rede.
- Em 2026-06-02, o widget global do Miauby refinou o enquadramento visual usando `site/miauw/miauby-avatar.jpeg`, derivado quadrado de `site/miauw/miauby-novo.jpeg`: o botao flutuante, o cabecalho e as mensagens mostram o avatar maior/proporcional por CSS central em `site/miauw/widget.css`, com cache-bust `20260602-avatar-fit`, sem alterar chat, audio, sessao ou backend.
- Em 2026-06-03, o botao flutuante do widget Miauby foi compactado novamente para nao ocupar tanto canto de tela, mantendo o avatar interno proporcional, sem alterar chat, audio, sessao ou backend.
- Em 2026-06-03, a Home autenticada informa ao widget global o nome exibido do usuario logado, vindo de `core_users.display_name` quando disponivel, para mostrar falas curtas perto do botao flutuante do Miauby apenas na Home. O controle fica em `sessionStorage` por usuario/sessao, a primeira fala aparece apos 10 segundos e cada balao fica visivel por 10 segundos antes da proxima fala, usando primeiro nome quando o nome exibido e longo, pausando por alguns minutos quando a pessoa interage com o widget e cache-bust `20260603-home-10s`. As falas ficam separadas em categorias `greetings` e `jokes`; piadas sao interacoes leves da Home e nao entram em confirmacao critica, erro de sistema, alerta operacional ou comando. Nao houve mudanca em login, SSO, chat, audio, permissao ou backend do Miauby.
- Em 2026-06-02, a aba/badge/lista de alertas do widget global do Miauby foi pausada por enquanto, e chamadas do widget nao disparam varredura do guardiao. O chat, audio, sessao e backend de diagnostico continuam preservados; alertas operacionais seguem consultaveis pelo Guardiao da tela Miauby/diagnostico, sem aparecer como coisa pendente no widget dos modulos.
- WordPress respondeu HTTP 200 localmente, mas ficou lento no Docker Desktop Windows com plugins restaurados.
- DNS GoDaddy e Nginx Proxy Manager estavam em configuracao para `wimifarma.com`.
- Cache de pagina WordPress/SpeedyCache esta opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A rota publica `/` e servida por `site/home.php`, uma home independente do bootstrap do WordPress. Antes dos cards, ela mostra um login inicial com sessao propria `WFHOME`, credencial temporaria padrao `adm`/`adm`, CSRF, a mesma logo SVG animada da home autenticada, texto `Apenas funcionarios`, anel animado, estrelas cadentes leves apenas no topo ciano e footer liquido com variacao cromatica lenta e bolhas integradas ao bloco, atendimento, botao do WhatsApp com icone solido e alinhamento central em telas estreitas, sem a lista antiga de modulos. Em 2026-05-30 e 2026-05-31, o footer do login foi reduzido por espacamento/altura sem alterar a animacao das bolhas, os tres arcos do anel foram ampliados novamente de forma leve em telas com espaco sem alterar o formulario, os textos do footer foram alinhados em colunas com limites de largura para leitura mais regular e o happy cat passou a zanzar tambem nessa tela. Em 2026-06-01, o login ganhou um card de video MP4 em loop (`assets/video/login-redirecionado.mp4`) com borda arredondada e link para `https://wimifarma.com.br`, preservando o formulario e o fluxo de autenticacao; no desktop ele fica ao lado do anel, e em telas estreitas aparece em versao compacta abaixo do formulario. Ainda em 2026-06-01, a troca multicolorida pesada e os circulos decorativos internos do footer foram desativados para evitar piscada/repaint no Chrome; a animacao liquida original foi restaurada com 128 bolhas e filtro SVG, mantendo `contain: layout` para preservar o visual sem recortar o efeito, e a variacao de cores voltou como ciclo lento de `background-color` aplicado ao bloco e as bolhas, sem mexer na geometria do efeito. Ainda em 2026-06-01, o topo do login passou a usar 28 estrelas cadentes aleatorias em CSS, sem fundo preto, atravessando a largura da area superior atras do formulario/video e reduzida em telas pequenas. Em 2026-06-01 e 2026-06-02, o footer do login ganhou contador anonimo por cookies `WFHOME_VISITOR` e `WFHOME_VISIT`, mostrando visitantes unicos e visitas registradas por janela de 30 minutos para nao contar redirecionamentos de login/logout como novos acessos, gravando apenas totais em `site/wp-content/uploads/wimifarma-runtime/home-counter.json` protegido por `.htaccess` gerado; a primeira visualizacao humana tambem inicializa visitante quando o arquivo estava zerado e o navegador ja tinha cookie. Em 2026-06-02, as informacoes do footer foram reagrupadas em marca, bloco de navegacao/atendimento e contador, com menos altura e sem alterar a animacao liquida. Ainda em 2026-06-02, o login foi ajustado para celulares e tablet pequeno com `100dvh`/safe-area, campos e botao com altura de toque, onda liquida afastada do formulario, card externo compacto abaixo do login e elementos flutuantes ocultos em celular, sem alterar autenticacao, CSRF, sessao, SSO ou desktop. A home autenticada emite `WFHOME_SSO` assinado quando `WIMIFARMA_HOME_SSO_SECRET` ou `WP_AUTH_KEY` esta forte; os modulos usam isso para pular a redigitacao de senha, mantendo sessao propria e permissao por modulo. Desde 2026-05-31, qualquer acesso direto sem sessao nem `WFHOME_SSO` a paginas protegidas ou telas antigas de login dos modulos volta para `/`, centralizando a entrada nessa home/login. Apos entrar, a home mostra fundo visual em video em tela inteira preservando as cores originais sem overlay branco de clareamento, logo animada propria sem fundo, GIFs decorativos com movimento igual aos logins e cards inferiores de acesso aos modulos.
- Desde 2026-06-06, o modal `Trocar usuario` destaca o usuario atual com cor propria, faixa lateral e badge `Atual`, sem mudar o fluxo de senha nem a renovacao de `WFHOME`/`WFHOME_SSO`. O perfil institucional `role=farmacia` nao aparece nessa troca e nao autentica como operador da Home, mantendo-se apenas como canal oficial do WhatsApp. Desde 2026-06-08, o modal tambem mostra o botao `Sair`, usando a rota existente `/?sair=1` para encerrar a sessao central e limpar cookies dos modulos.
- Em 2026-06-03, a animacao liquida do footer da tela de login foi suavizada: as bolhas passaram a usar movimento por `transform` com ciclos mais longos, deriva lateral e uma crista liquida continua, enquanto a variacao cromatica ficou centralizada em `--footer-background` herdado pelos blobs para reduzir repaint repetido no Chrome. Login, CSRF, sessao, SSO, layout desktop/mobile e contador anonimo nao foram alterados.
- A logo oficial foi atualizada em 2026-05-21 como SVG horizontal e esta sincronizada nos assets compartilhados de Cashback/Codigos/Gestao/Pedidos, Financeiro, Tarefa, Miauw e Cotacao V2. A home publica usa uma variacao animada propria em `logo-wimifarma-home-animated.svg`, sem trocar os SVGs oficiais dos modulos internos.
- Desde 2026-06-09, a Home usa `logo-wimifarma-home-animated.svg` como variacao animada em loop, sem fundo, aplicada no login central, no rodape do login e no header autenticado. A animacao enviada pelo usuario foi preservada e corrigida com filtro SVG interno para transformar os PNGs recortados de preto para branco e remover o fundo branco como transparencia, mantendo preload `image/svg+xml`, prioridade/cache-bust em `site/home.php`, proporcao `1024/400` e sem `mix-blend-mode`.
- Em 2026-05-21, Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw foram validados com navegador local e checks publicos: as telas de login e as telas internas autenticadas carregam a logo nova. O `/wp-login.php` permanece com o cabecalho padrao do WordPress, separado dos logins internos.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe contador vermelho de tarefas abertas quando houver pendencias.
- A home publica mostra no maximo cinco cards por linha no desktop, na ordem `Cashback`, `Cotacao`, `Pedidos`, `Financeiro`, `Tarefas`, `Codigos`, `XP`, `Gestao`, `Miauby`, `Miauby Whatsapp`, `Login / Senha` e `Usuarios`; `Usuarios` fica por ultimo quando todos estiverem visiveis. O card `Miauby` usa a rota canonica `/miauby/` e o card `Miauby Whatsapp` usa `/miauby/whatsapp/`, mantendo `/miauw/*` como compatibilidade. `Pedidos` mostra badge com o total ainda em `Aguardando chegada`, o card `XP` usa moldura propria como borda/cantos por `border-image`, sem cortar a arte nem cobrir o texto, enquanto os demais cards seguem em grade compacta. Quando a home tem `WFHOME_SSO` valido ou o navegador tem sessao ativa no XP/Usuarios, e o login esta vinculado em `core_user_xp_links`, a home mostra no desktop um mini-card do XP a esquerda da grade, lendo os totais atuais de `xp_sales` e atualizando por polling curto; a grade ajusta colunas conforme a quantidade de cards visiveis pelo filtro de permissoes. No mobile os cards ficam em duas colunas para caber mais acessos por tela.
- Desde 2026-06-03, o login da Home autentica primeiro em `core_users` ativo, normalizando o login para `username_normalized` em minusculo e conferindo `password_hash` bcrypt. Login com caixa diferente (`thiago`, `Thiago`, `THIAGO`) entra no mesmo usuario canonico; `WIMIFARMA_HOME_LOGIN_USER`/`WIMIFARMA_HOME_LOGIN_PASSWORD` segue apenas como fallback operacional.
- O modulo `Cashback` fica oficialmente em `apps/cashback`, usa Node.js/TypeScript/Express com Postgres `wimifarma_cashback`, sessao propria `WFCASHBACK`, login unico por `core_users` e proxy Apache em `/cashback/`. A tela preserva o CSS/JS/assets de `site/cashback`, enquanto PHP direto nessa pasta fica bloqueado por `.htaccess`; desde 2026-06-04, os PHPs antigos de tela/API/diagnostico que consultavam `wf_*` ficam arquivados em `site/_legacy-disabled/2026-06-04/cashback-php/`, e `site/cashback/functions.php` e apenas bootstrap compartilhado minimo para o Miauby. Desde 2026-05-30, a paridade com `wf_*` foi validada e o app nao possui mais `mysql2`, importador, espelho, logs ou fallback de autenticacao MySQL. Cada novo credito de cashback fica vinculado a compra que o gerou e expira 45 dias apos `cashback_purchases.purchased_at::date`, sem zerar outros creditos validos do cliente. Desde 2026-06-03, compra/resgate do Cashback resolve o responsavel pelo usuario logado da sessao core, vinculando `cashback_attendants.core_user_id` e preenchendo/travando o campo Atendente para nao registrar operacao como `Sem atendente` ou em nome de outro usuario comum. Desde 2026-06-06, o Balcao mostra os ultimos clientes alterados, 5 visiveis por padrao e `Mostrar mais` em blocos de 5; a busca do Balcao e do autocomplete filtra clientes ativos e normaliza telefone/ID para evitar resultados gerais quando a busca textual nao tem numeros. O cadastro rapido `Novo cliente` no Balcao usa blocos visuais separados para dados do cliente e compra inicial opcional, sem alterar campos, calculo, CSRF ou POST. A fila `Cashback vencendo em ate N dias` mostra somente creditos ativos ainda nao vencidos, separados por data de vencimento, e creditos vencidos seguem o status `expirado` existente sem apagar historico. A fila `Clientes com saldo e sem compra recente` mantem uma pendencia de recompra por cliente e ultima compra por ate 14 dias, arquivando com `expirado_da_fila` quando envelhece; `Excluir da fila` usa `cancelada` e tambem impede retorno imediato, sem apagar cliente, saldo ou historico. Desde 2026-06-06, o atalho visual `Diagnostico` saiu do topo do Cashback; a rota tecnica permanece acessivel por URL para manutencao. Ainda em 2026-06-06, a navegacao superior do Cashback destaca a pagina/secao ativa, e `Configuracao e Relatorio` ganhou layout compacto com atalhos internos, cards menores, lista de atendentes com rolagem propria e microanimacoes CSS, sem alterar escrita, relatorios CSV ou permissao. Rollback agora exige restaurar commit/imagem anterior e backup, nao trocar `.env`.
- O modulo `Usuarios` fica oficialmente em `apps/usuarios`, usa Node.js/TypeScript/Express com Postgres core `wimifarma_core`, sessao propria `WFUSUARIOS`, login restrito a `adm` ou role `admin`, proxy Apache em `/usuarios/`, cria/desativa usuarios internos, registra permissoes por modulo em `core_user_module_permissions`, vincula login a funcionario XP em `core_user_xp_links` e vincula numeros do Miauby WhatsApp por `core_user_whatsapp_links` sem gravar telefone cru no core. Desde 2026-06-05, tambem permite corrigir o numero vinculado pelo proprio Usuarios: a tela envia o novo numero para o bridge, que atualiza o contato cifrado, e o core reconcilia somente mascara, status, nome e cards. Os perfis exibidos sao `Colaborador`, `Gerente`, `Admin` e `Farmacia`; internamente ficam `user`, `gerente`, `admin` e `farmacia`. Perfil e cards sao controles separados: o perfil fica em `core_users.role`, enquanto os cards/modulos visiveis continuam salvos individualmente por usuario em `core_user_module_permissions`; nao ha configuracao global de cards por perfil nem alteracao em massa ao trocar um perfil. Regras gerais por perfil so devem ser criadas quando o usuario pedir explicitamente, implementadas no modulo dono e registradas no card/documentacao; nao presumir hierarquia nem permissao nova por conta propria. `Farmacia` representa o WhatsApp institucional, sem XP/ferias pessoais: o Miauby Whats pergunta quem fez a acao antes de registrar sangria, Pix CNPJ, pedido ou acao sensivel sem responsavel informado, lista usuarios quando o nome nao existe e pergunta destino quando a tarefa nao diz para quem. Em foto/PDF de Pix CNPJ lido pelo WhatsApp oficial, a Farmacia recebe resumo curto do valor/data/destino e escolhe o responsavel humano antes de gravar; se a leitura falhar, o bridge pede o comando manual. Tarefas privadas devem ser criadas e gerenciadas pelo modulo `/tarefa/`, mantendo `Usuarios` apenas como painel de conta, permissoes, XP, ferias, WhatsApp e auditoria. No cadastro, o ADM pode digitar nome com espaco/acento e o backend gera um login seguro automaticamente, como `Joao Silva` -> `joao.silva`; na edicao, usuarios comuns podem ter o login alterado com a mesma normalizacao e bloqueio de duplicidade por `username_normalized`. `core_users.display_name` guarda o nome exibido sem trocar o login tecnico. Ao salvar nome exibido ou login tecnico de usuario com WhatsApp vinculado, Usuarios sincroniza o nome e o `linked_username_snapshot` no bridge; o responsavel real no WhatsApp continua sendo o `linked_user_id` ativo no core. Ao abrir o painel ou apos vincular/editar numero, Usuarios tambem reconcilia `core_user_whatsapp_links` com o bridge por usuario, inserindo/atualizando snapshots seguros e marcando ausencias como `stale_bridge_missing`, sem telefone cru. Desde 2026-06-03, o nome do vinculo XP sincroniza automaticamente: Usuarios atualiza `xp_employees.name` ao salvar nome/vinculo, e o XP atualiza `core_user_xp_links.xp_employee_name` e `core_users.display_name` dos usuarios vinculados ao editar funcionario/perfil ADM. O usuario mestre `adm` pode editar nome exibido, senha, XP e WhatsApp, mas nao pode trocar o login tecnico, ser excluido, desativado, perder admin ou ficar sem modulos. Senhas simples podem ser cadastradas pelo ADM, mas o login continua usando bcrypt e o cofre ADM guarda apenas copia cifrada. Cada card de usuario traz um historico individual recolhido por padrao, lendo `core_audit_logs` para mostrar acoes feitas pelo login e alteracoes aplicadas a ele.
- Em 2026-06-03, os cards do painel Usuarios foram refinados no frontend e depois simplificados para nao criar tarefa privada nesse modulo: cabecalho, badges, resumo de acesso com nome/login/senha ADM mascarada, edicao de conta, cofre ADM, status, modulos, ferias e WhatsApp usam grids responsivos previsiveis, mantendo CSRF, permissoes, senha/hash, cofre, WhatsApp e auditoria. O painel tambem mostra o card `Perfis do sistema`, explicando Colaborador, Gerente, Admin e Farmacia sem criar permissao nova; o destaque principal e lembrar que perfil nao e o mesmo que cards, que cards continuam individuais por usuario, que regras gerais por perfil so aparecem quando implementadas de verdade, e que Farmacia e canal institucional que precisa de responsavel humano para acoes operacionais.
- Ainda em 2026-06-03, clicar no corpo/cabecalho de um card de usuario passou a abrir a edicao automaticamente; o botao `Editar`, `Historico`, campos, botoes, links e formularios mantem seus comportamentos proprios.
- Desde 2026-06-02, Usuarios tambem guarda `Ferias do usuario` no core (`core_user_vacations`, eventos e logs). Durante `inicio <= hoje em America/Sao_Paulo < retorno`, o Miauby Whats bloqueia mensagens automaticas para contatos vinculados ao usuario, registra o motivo no historico central, nao remove allowlist e nao bloqueia login; no primeiro dia e no retorno, o bridge pode enviar saudacoes curtas com idempotencia.
- Desde 2026-06-02, o Miauby resolve o responsavel de acoes por prioridade: sessao logada, vinculo WhatsApp/allowlist, responsavel manual e, se nada existir, responsavel nao identificado. Financeiro/sangria pelo Miauby usam o nome exibivel da sessao ou do numero vinculado e gravam `usuario_id`/`actor_user_id`, sem permitir que um operador comum registre como outra pessoa por texto solto. A excecao e o perfil `Farmacia`: ele identifica o canal oficial, mas precisa resolver/escolher um responsavel humano antes de gravar acoes operacionais; essa escolha por numero/nome nao confirma nem cancela a acao, apenas define o humano antes do fluxo normal.
- O modulo `Codigos` fica oficialmente em `apps/codigos`, usa Node.js/TypeScript/Express com Postgres `wimifarma_codigos`, sessao propria `WFCODIGOS`, login unico por `core_users` e proxy Apache em `/codigos/`. A tela preserva apenas CSS/JS de `site/codigos`; o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`. Desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, logs, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` nem flags `CODIGOS_LEGACY_MYSQL_*`; `wf_codigos_*` fica apenas como referencia historica/backup. O Miauby prefere `/codigos/api/internal/summary` e `/codigos/api/internal/search` com token interno para ler a fonte Postgres.
- O modulo `XP` fica oficialmente em `apps/xp`, usa Node.js/TypeScript/Express com Postgres `wimifarma_xp`, sessao propria `WFXP`, login unico por `core_users` e proxy Apache em `/xp/`. A tela preserva CSS/JS/assets/uploads de `site/xp`; o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/xp-php/`. Desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, logs, fallback `wf_users`, `XP_AUTH_PROVIDER` nem flags `XP_LEGACY_MYSQL_*`; `wf_xp_*` fica apenas como referencia historica/backup.
- O modulo `Financeiro` fica oficialmente em `apps/financeiro`, usa Node.js/TypeScript/Express com Postgres `wimifarma_financeiro`, sessao propria `WFFINANCEIRO`, login unico por `core_users` e proxy Apache em `/financeiro/`. A tela preserva o CSS/JS/assets de `site/financeiro`, e `financeiro-funcoes.php` continua apenas como helper minimo de data por include do Miauby; PHP direto nessa pasta fica bloqueado por `.htaccess`. Desde 2026-06-04, o PHP completo antigo do Financeiro fica arquivado em `site/_legacy-disabled/2026-06-04/financeiro-php/`. Desde 2026-05-30, a paridade com `financeiro_*` no MySQL foi validada e o app nao possui mais `mysql2`, importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` nem flags `FINANCEIRO_LEGACY_MYSQL_*`.
- O modulo `Gestao` foi elevado para Node.js + TypeScript + Postgres: login restrito a `adm`, `admin` ou `gerente`, contas a pagar manuais em `gestao_accounts`, categoria livre com resumo lateral normalizado, lista operacional compacta, painel `Mensal` para contas com repeticao ativa e ordem manual salva, busca por nome/valor/categoria/datas com limite inicial de 10 e `Mostrar mais`, itens flexiveis em `gestao_account_items`, pagamentos parciais datados em `gestao_account_payments`, vencimento opcional por data com urgencia visual, status reversivel, extrato por conta com saldo/progresso, pagamento parcial por qualquer lancamento aberto, cancelamento/reabertura de lancamento sem apagar historico, exclusao da tela apenas por arquivamento de contas canceladas, reabertura de contas pagas, renomeacao por icone de lapis, repeticao do mes seguinte em ciclo liga/desliga sem copiar pagamentos, recorrencia permanente `Repetir sempre mes que vem` em `repeat_forever`, observacao editavel/minimizavel, detalhes abertos ao clicar na linha compacta, pagamentos/historico minimizaveis e bloco de notas lateral em `gestao_notepad_notes`, com auditoria em `gestao_audit_events` e `core_audit_logs`. Desde 2026-06-01, contas pendentes de competencias anteriores aparecem na visao do mes selecionado ate serem pagas/canceladas, preservando a competencia original; pagamentos datados no mes seguem compondo o total pago daquele mes. Ainda em 2026-06-01, contas com repeticao ativa aparecem primeiro na lista, recebem simbolo de repeticao e nao usam mais botao separado `Abrir`. Desde 2026-06-03, contas com `repeat_forever` ficam no topo do painel `Mensal` e, quando pagas, garantem a copia pendente do proximo mes sem duplicar financeiro. Desde 2026-06-05, contas ligadas a Pedidos aparecem em um bloco visual `Pedidos` ao lado do painel `Mensal`, saindo da lista geral para nao misturar boletos de fornecedores com contas manuais, mas mantendo categoria `Boleto`, pagamentos, totais, status, busca/filtro e auditoria no mesmo fluxo. Desde 2026-06-06, a tela usa acentos visuais por bloco para separar melhor operacao manual, contas abertas, Pedidos, Mensal, Categorias e Notas, preservando todas as escritas existentes.
- O modulo `Pedidos` controla fornecedores em `/pedidos/`, separado da tela de Gestao. Ele usa `pedidos_orders` para pedidos registrados/aguardando chegada e `pedidos_confirmed_orders` para confirmados/historico, sempre vinculando valores, parcelas e pagamentos a uma conta da categoria `Boleto` em `gestao_accounts`. Cada parcela em `gestao_account_items` pode ter vencimento proprio (`due_at`), e a conta usa a menor data ativa como vencimento geral para ordenacao/resumo. Contas de pedidos nao entram em recategorizacao em lote para preservar esse controle. A tela carrega o widget do Miauby; pedidos novos podem marcar `Pago, falta chegar`, `Chegou, falta pagar` ou `Chegou e pago - Registrar`. O segundo caso vai direto para `Confirmados`; o terceiro registra o pedido manualmente ja recebido e pago em `Historico`, cria um unico pagamento total em `gestao_account_payments` e nao gera pendencia de chegada nem cobranca. Pedidos ainda em `Aguardando chegada` tambem podem ser marcados como `Pago, falta chegar`, gravando apenas o saldo aberto em `gestao_account_payments` e mantendo a chegada pendente. A previsao de chegada do novo pedido e digitada como numero de dias (`2` = dois dias a partir de hoje) e o backend grava a data calculada em `expected_arrival_at`; a data/hora real do registro fica persistida em `pedidos_orders.created_at` e e usada pelo Miauby WhatsApp para mostrar quando o pedido foi feito. O formulario de novo pedido fica separado em blocos de fornecedor, parcelas, entrega, status inicial e observacao, com total destacado no cabecalho sem mudar o fluxo de criacao. Cards em `Aguardando chegada`, `Confirmados` e `Historico` ficam minimizados por padrao ao clicar no resumo do card; nos cards ativos, status, saldo e a acao principal continuam visiveis no modo reduzido (`Confirmar chegada` ou `Pago`), com icone de lapis para editar fornecedor, editar/retirar parcelas ativas e adicionar nova parcela com vencimento opcional, tudo com arquivamento logico/auditoria quando aplicavel. Em 2026-05-25, esses cards e os cards-resumo do topo ficaram mais baixos/densos, com acao principal em botao curto alinhado a direita para caber mais pedidos por tela. Em 2026-05-26, o topo ganhou `Valor para chegar`, somando saldo aberto dos pedidos aguardando chegada, e `Valor boletos abertos`, somando o saldo aberto dos boletos confirmados. O vencimento do boleto e a data do pagamento parcial em Pedidos sao informados apenas por data, sem horario na interface. A URL antiga `/gestao/pedidos` redireciona para `/pedidos/`.
- O Financeiro mostra no topo `Caixa`, `Relatorio` e `Home`; a tela dedicada de Auditoria saiu da navegacao da equipe, mas `financeiro_audit_events` continua registrando alteracoes internas no Postgres. Caixa e Relatorio compartilham o mesmo fechamento diario: `Fechar sem movimento` no Relatorio marca `sem_movimento` como atalho do Caixa, sem bloquear a digitacao posterior de venda/faturamento. Desde 2026-06-02, o backend bloqueia `sem_movimento` quando o dia ja possui lancamento ativo ou valor/faturamento salvo, respeita bloqueio explicito por `core_user_module_permissions` para o modulo `financeiro`, preenche o responsavel do fechamento com o login atual quando o campo esta vazio, separa corretamente o autosave `save_day` do clique final `close_day`/`close_empty` e espelha acoes operacionais principais em `core_audit_logs`.
- A Cotacao V2 substitui a interface antiga em `/cotacao/` para eliminar bugs de palavra-gatilho, salto de linha e travamento em categoria. Palavras como `geral`, `urgente`, `encomenda` e `cotacao` continuam sem acionar cor, prioridade, ordem ou filtro escondido; cor so vem de regra condicional criada explicitamente na tela.
- Desde 2026-06-01, `encomenda` tem uma excecao operacional documentada: quando aparece em uma linha da Cotacao, o backend registra um lembrete em `cotacao_v2_encomenda_reminders` e tenta avisar o Miauby Whats no dia seguinte as 16h, sem alterar valores da cotacao.
- A Cotacao V2 usa linha com UUID estavel, save por celula, presenca ao vivo via Socket.IO/Redis, filtros locais por tela e eventos em Postgres. A primeira validacao confirmou login, bootstrap, save dessas palavras criticas e criacao/remocao de regra condicional explicita.
- A interface da Cotacao V2 foi aproximada do visual de planilha operacional: cabecalho compacto, abas locais, estatisticas no topo, CSV rapido e colunas fixas iniciais `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, fornecedores e `Ganhador`.
- A Cotacao V2 agora preenche a largura da tela como planilha, usa fonte 20px centralizada nas celulas, mostra usuarios ativos com nomes de animais por aba, permite menu de contexto para inserir linhas, colorir e inserir/apagar somente colunas de distribuidoras, possui paleta de cores para linhas/colunas/celulas e calcula o `Ganhador` pelo menor preco das distribuidoras.
- A Cotacao V2 removeu os botoes visiveis de adicionar linhas e colar planilha: inserir linhas fica no menu de contexto, adicionar em lote fica no rodape e colagem do Sheets usa `Ctrl+V`. A tela tambem possui desfazer/refazer, selecao multipla, `Enter` para descer uma celula, filtros por icone em `CATEGORIA` e `Ganhador`, backup/restore do Postgres e import/export Google Sheets controlado por variaveis de ambiente; o diagnostico operacional continua disponivel por API, mas saiu do menu principal da equipe.
- No editor de celula da Cotacao V2, duplo clique e `F2` entram em edicao sem selecionar todo o conteudo existente; o usuario consegue posicionar cursor, selecionar trechos e usar setas dentro do texto. Quando a edicao comeca por digitacao direta na celula selecionada, as setas confirmam o valor e navegam para a celula vizinha, mantendo o fluxo rapido de planilha. O rodape `Adicionar 20 linhas` adiciona linhas no DOM de forma incremental para evitar lag em planilhas maiores.
- A Cotacao V2 recebeu ajustes de operacao diaria: celulas quebram texto e aumentam altura para nao cortar conteudo, cabecalhos/linhas selecionam coluna/linha inteira, cabecalhos de distribuidoras aceitam duplo clique para renomear, larguras de coluna podem ser arrastadas pelo titulo, apagar distribuidora pode ser desfeito com `Ctrl+Z` na mesma sessao, e o fim da rolagem oferece `Adicionar 20 linhas`.
- A operacao diaria tambem cobre `Ctrl+C` em selecao de celulas, `Ctrl+Z`/`Ctrl+Y` para desfazer/refazer a ultima acao local de celula, lote, filtro, coluna ou pintura manual/borracha, colagem com normalizacao de texto/numeros, formato condicional editavel que pinta apenas a celula da coluna-alvo com texto preto, normalizacao de regras antigas/restauradas para alvo `cell`, paleta de cores flutuante pelo topo ou menu de contexto com tons do mais forte ao mais claro, manutencao da linha visivel durante edicao sob filtro e heartbeat/recarregamento leve apos inatividade.
- A Cotacao V2 agora filtra tambem por `PRODUTO` e por cor nas colunas filtraveis, ordena o filtro de `Ganhador` com vencedores individuais antes de empates e `Sem vencedor`, permite selecionar varias colunas/linhas arrastando pelos cabecalhos e mostra data/hora no hover de celulas que baterem em regra condicional com essa opcao marcada.
- A alca no canto da selecao da Cotacao V2 foi ampliada e permite arrastar para copiar valores e cores visiveis da selecao para celulas vizinhas.
- Em 2026-06-01, a Cotacao V2 ganhou atalho `F4` na tela da planilha para repetir a ultima acao util e segura no contexto atual. A estrutura repetivel registra apenas valor nao vazio, colagem sem celulas vazias, aplicar cor e limpar cor; exclusao, apagar distribuidora, cancelar, finalizar, enviar, importar/exportar e restore nao entram no atalho. O feedback aparece no status da planilha quando a acao repete, nao existe ou nao combina com a selecao atual.
- O modo de cor da Cotacao V2 e uma acao unica: depois de aplicar cor ou borracha na selecao atual, a tela desarma o modo para evitar colorir a proxima celula sem querer. O filtro de `Ganhador` mostra contagem por resultado, como `Anb (4)`.
- Os assets vivos da Cotacao V2 (`app.js` e `styles.css`) sao servidos sem cache forte para evitar que deploys rapidos fiquem presos no navegador.
- A Etapa 1 de performance da Cotacao V2 adicionou indices aditivos no Postgres e ampliou `/cotacao/api/diagnostics` com blocos `safety` e `performance`; `/cotacao/api/bootstrap` segue como fallback completo durante a evolucao do sync incremental.
- A Etapa 2 criou `GET /cotacao/api/events?after=<eventId>` e passou o refresh automatico da Cotacao para delta incremental, mantendo `/cotacao/api/bootstrap` como fallback quando houver evento estrutural, cursor invalido ou excesso de eventos.
- A Etapa 3 reduziu o custo das mutacoes simples da Cotacao V2: salvar celula, lote de celulas, estilos, regras, linhas e colunas usam consultas pontuais de validacao em vez de carregar o snapshot inteiro por `loadSheet()`.
- A digitacao em celulas agenda o auto-ajuste de altura por frame do navegador para reduzir recalculo de layout e suavizar a escrita em planilhas maiores.
- A Etapa 4 deixou a troca de celula mais fluida: saves de celula passam a ser otimistas no frontend, redesenhando somente a linha afetada enquanto a API confirma em segundo plano.
- A presenca ao vivo agora tambem aparece dentro da grade: quando outra pessoa seleciona ou edita uma celula visivel, a celula ganha contorno colorido, etiqueta do animal e tooltip com coluna/linha.
- Apagar conteudo com `Delete`/`Backspace` na Cotacao V2 tambem ficou otimista: a selecao limpa na hora e o save em lote confirma em segundo plano sem redesenhar a tabela inteira para um caso simples.
- Quando a aba esta editando uma celula e recebe eventos remotos de celula/lote, a Cotacao guarda as linhas afetadas e redesenha ao encerrar a edicao, evitando `Ganhador`, contadores ou celulas calculadas visualmente atrasadas.
- Redimensionar coluna, inserir linha, criar, renomear, apagar ou restaurar distribuidora nao deve mais forcar `/cotacao/api/bootstrap` na propria aba nem nas demais; esses fluxos usam payload incremental de evento e atualizacao local da grade.
- O redimensionamento de coluna usa evento Socket.IO dedicado `column:resized` e auto-ajuste apenas da coluna alterada, evitando que abas antigas disparem snapshot completo ao soltar o mouse.
- O carregamento inicial da Cotacao V2 renderiza a grade antes de fatiar o auto-ajuste de altura das celulas em frames, reduzindo a tela vazia com `Carregando...` quando ha muitas linhas/colunas.
- O numero da linha da celula ativa fica destacado em verde forte, facilitando localizar visualmente a linha atual sem alterar dados nem compartilhar esse destaque com outras telas.
- A alca de preenchimento, colagem e desfazer/refazer de lotes agora seguem o mesmo modelo otimista: aplicam localmente, salvam em lote e atualizam somente as linhas afetadas; estilos copiados ou aplicados em selecoes grandes usam `/cotacao/api/styles/batch`.
- Filtros continuam locais por navegador. Quando duas pessoas salvam a mesma celula, a Cotacao segue o comportamento estilo Sheets pedido pelo usuario: o ultimo salvamento vence, com presenca visual e historico de celula para recuperar valor anterior.
- Os modulos internos deixam a troca de operador centralizada na Home principal: seus headers mostram `Home` para voltar a `/` sem encerrar sessao local, enquanto `site/home.php` exibe `Trocar usuario`. A troca lista usuarios ativos, pede apenas a senha do escolhido, renova `WFHOME`/`WFHOME_SSO` e limpa cookies/estado frontend dos modulos para evitar carregar dados do operador anterior. A rota `/?sair=1` continua sendo o logout central e fica exposta visualmente apenas pelo botao `Sair` do modal da Home.
- O widget do Miauby voltou a carregar dentro da Cotacao V2, a tela de login foi compactada para ocupar menos a tela e os endpoints JSON limpam saida acidental antes de responder, evitando HTML misturado no login/chat.
- Na Cotacao V2, o widget do Miauby tambem pode soltar localmente o `pikachu-loop.webp` para uma ronda visual curta: ele sai do balao do Miauby, circula pela tela, desvia do mouse e volta ao widget, sem gravar estado nem mexer na sincronizacao da planilha.
- Pendencias/cuidados atuais da Cotacao V2: Google Sheets ainda precisa de credenciais reais no `.env` do VPS; restore/import sao acoes fortes e devem ser usados com backup/revisao; o `fill handle` ja copia padroes, mas series automaticas mais inteligentes ainda podem evoluir.
- Miauby possui `miauw_skill_registry()` para inventariar skills por modulo, risco, nivel, permissao, auditoria e executor antes de novas autonomias. Consultas de alertas e conhecimentos foram aliviadas para reduzir trabalho repetido.
- Miauby iniciou a Fase 1 do agente operacional v2: `MIAUW_AGENT_VERSION`, prompt/politica versionados, isolamento de bastidores tecnicos, guardrails finais contra mencoes a agente de desenvolvimento/fornecedor/chaves/prompts e status de versao no widget.
- Miauby iniciou a Fase 2 do agente operacional v2 com evals locais em `site/miauw/miauw-evals.php`, cobrindo guardrails, intents de Financeiro/Tarefas/Cotacao, rotas de modelo e registry de skills sem chamada online nem escrita real.
- Os guardrails finais tambem redigem fragmentos de chaves `sk-...` como credencial interna antes de mostrar texto ao operador.
- Miauby iniciou a Fase 3 com o painel restrito `/miauw/diagnostico.php`, reunindo status do agente/API, modelos, registry de skills, alertas, diagnosticos internos recentes e revisao segura de memorias/padroes.
- `miauw_memorias` e `miauw_padroes` agora possuem status de revisao (`pendente`, `aprovado`, `ignorado`); o painel marca revisao sem apagar dados.
- Miauby iniciou a Fase 4 do agente operacional v2: as tools core ficam registradas e cobrem sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- A consulta e criacao de encomenda na Cotacao pelo Miauby usam uma ponte interna com o servico Node da Cotacao V2, protegida por token, em vez de depender da Cotacao PHP antiga.
- Em 2026-05-30, as tools do Miauby para Cashback, Tarefa, Cotacao, Codigos e Financeiro foram presas aos endpoints internos Node/Postgres dos modulos. Se a ponte moderna ou token falhar, o Miauby responde indisponibilidade e nao cai mais em `wf_tarefas`, `wf_compras`, `wf_clientes`, `wf_codigos_comissao`, `cotacao_*` antigo ou `financeiro_*` legado MySQL.
- Miauby iniciou a Fase 5 do agente operacional v2: `miauw_tool_traces` registra trace por conversa/request/tool, o painel `/miauw/diagnostico.php` mostra tools recentes e estatisticas de traces, o widget/chat exibe resposta digitando visualmente e acoes fortes exigem card de confirmacao antes de gravar.
- Miauby iniciou a Fase 6 do agente operacional v2: os evals locais foram ampliados para validar contrato da proxima camada, schemas das tools, dados obrigatorios antes de escrita, regra de nao inventar dados e confirmacao obrigatoria para escrita forte. O diagnostico tambem mostra um contrato seguro para a futura camada Node.js 22 + TypeScript com Agents SDK, sem trocar o motor atual ainda.
- Miauby iniciou a Fase 7 do agente operacional v2: `apps/miauw-agent` adiciona um servico Node.js 22 + TypeScript com `@openai/agents`, publicado internamente em `/miauw/agent/`, com health publico minimo e endpoints internos `status`/`run`/`stream` protegidos por token. Ele roda em modo sombra, sem escrita real, enquanto o PHP segue dono do chat, sessoes, widget, confirmacoes e auditoria.
- Miauby iniciou a Fase 8 do agente operacional v2: o PHP ganhou adaptador para chamar o servico Node em sombra, comparar resposta oficial com resposta sombra e registrar trace seguro em `miauw_tool_traces`. A comparacao automatica por envio fica desligada por padrao (`MIAUW_AGENT_SHADOW_ON_SEND=false`) para nao impactar a operacao.
- Miauby iniciou a Fase 9 do agente operacional v2: existe `MIAUBY_ENGINE=php|node_shadow|node` com fallback para `MIAUW_ENGINE` para cortar o motor com rollback por `.env`, `MIAUW_MAINTENANCE_MODE` bloqueia usuarios comuns durante testes e `adm` fica liberado por padrao para usar o Node como resposta oficial quando configurado.
- Miauby iniciou a Fase 10 do agente operacional v2: a personalidade do Miauby agora tem contrato versionado (`miauby-persona-2026-05-16`) no PHP, no diagnostico e no servico Node. O agente Node preserva tom de fiscal interno, humor curto, bordoes controlados e pedido minimo de contexto, e `apps/miauw-agent` possui `npm run check:persona` para evitar regressao para resposta generica.
- Miauby iniciou a Fase 11 do agente operacional v2: o PHP exporta contratos versionados das tools OpenAI a partir do registry e envia esse contexto ao servico Node em `run`/`stream`; o Node usa isso para responder com nocao das capacidades auditadas, mas continua sem escrita direta, com confirmacoes e execucao real ainda no PHP.
- Miauby iniciou a Fase 12 do agente operacional v2: o servico Node executa uma primeira tool real de leitura segura (`consultar_contrato_tool_miauby`) sobre os contratos enviados pelo PHP. Ela apenas consulta capacidades auditadas; escrita, confirmacao, sessao e auditoria de dados continuam no PHP.
- Miauby iniciou a Fase 13 do agente operacional v2: o servico Node executa tools reais de leitura baixa por uma ponte PHP interna tokenizada (`/miauw/agent-tools.php`) para Financeiro, Cashback, Codigos e Cotacao, com pre-leitura deterministica quando o pedido e claro. O Node continua sem credencial de banco e com `writes_enabled=false`; sangria, tarefas, encomendas e qualquer escrita forte seguem no fluxo PHP com confirmacao/auditoria.
- Miauby iniciou a Fase 14 do agente operacional v2: o servico Node passou a orquestrar todas as OpenAI tools exportadas pelo registry via ponte PHP universal. Leituras, diagnosticos e cliente mascarado executam pelo PHP auditado; `criar_tarefa` pode gravar como escrita de baixo risco com usuario logado; sangria, lancamentos, encomendas e demais acoes fortes retornam `confirmation_required`, sem escrita direta pelo Node. Desde 2026-05-26, quando esse retorno acontece com `MIAUW_ENGINE=node`, o Node devolve um evento estruturado e o PHP cria a confirmacao na sessao real do operador para exibir o card `Confirmar/Cancelar`.
- Miauby iniciou a Fase 15 do agente operacional v2: existe um roteador de estilo versionado (`miauby-style-router-2026-05-16`) para perguntas casuais, bastidor tecnico, saudacoes e ruido. O PHP exporta contexto de estilo e memorias/padroes aprovados ao Node; o Node responde localmente quando nao precisa gastar chamada online, evita listas em conversa solta e preserva a voz de gato fiscal sem virar catalogo de ferramentas.
- Miauby iniciou a Fase 16 do agente operacional v2: o chat ganhou feedback `Boa`/`Treinar`, o painel restrito `/miauw/treino.php` revisa exemplos de resposta, a tabela `miauw_treinos_respostas` preserva versoes sem apagar historico e exemplos aprovados entram no `style_context` enviado ao Node. O servico agente passou para `SERVICE_VERSION=0.10.0` e `PHASE=fase16-training-feedback`, ainda sem escrita direta no Node.
- Miauby iniciou a Fase 17 do agente operacional v2: exemplos aprovados viram um perfil compilado de voz/relevancia antes de chegar ao Node, perguntas repetidas pelo treino podem responder localmente sem chamada online, e o servico agente passou para `SERVICE_VERSION=0.11.0` e `PHASE=fase17-training-compiler`.
- Miauby iniciou a Fase 18 do agente operacional v2: o PHP exporta perfis versionados de voz/tom (`miauby_padrao`, `miauby_curto`, `miauby_operacional`) e um contrato de audio seguro (`text_only`, sem microfone, playback, transcricao ou gravacao). O Node passou para `SERVICE_VERSION=0.12.0` e `PHASE=fase18-voice-audio-readiness`, recebendo o perfil de voz no `style_context`; audio real continua desligado por padrao.
- Miauby ajustou a Fase 19 do agente operacional v2: o chat e o widget global usam botao `Falar` em fluxo estilo WhatsApp. O navegador grava audio temporario somente apos clique, o PHP transcreve com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, a tela mostra um rascunho local com player/duracao/transcricao, o texto entra no campo para revisao e o usuario decide `Enviar`, `Refazer` ou `Descartar audio`. A chave nao vai para o navegador, audio nao e armazenado no banco e escrita operacional por voz continua bloqueada.
- Miauby iniciou a Fase 20 do agente operacional v2: audio enviado aparece no chat/widget como player com ondas, sem mostrar a transcricao na bolha enviada; a transcricao segue internamente para contexto. Quando a mensagem veio por audio, o PHP gera resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts` e `MIAUW_SPEECH_VOICE=marin`, sem armazenar audio. Audios curtos demais sao bloqueados para reduzir transcricao inventada.
- Miauby iniciou a Fase 21 do agente operacional v2: o playback dos audios usa URL temporaria `blob:` permitida apenas em `media-src`, a resposta falada mostra o audio como principal e deixa a transcricao escondida por padrao, o TTS recebeu perfil de fala mais vivo e o diagnostico permite escolher voz base entre `marin`, `cedar`, `ash`, `coral` e `verse` sem mexer em segredo.
- Em 2026-06-03, a transcricao do audio interno deixou de usar lista de termos da Wimifarma como prompt do transcritor e passou a rejeitar resposta que pareca glossario interno inventado. Se o audio estiver curto, silencioso ou sem fala clara, o rascunho nao deve ser preenchido com termos soltos; a interface pede para refazer.
- O canal WhatsApp do Miauby iniciou como backend dedicado em `apps/miauw-whatsapp`, usando Node.js 22 + TypeScript e Postgres 17 proprio. O servico publica `/miauw/whatsapp/` por proxy Apache, recebe webhooks da Evolution API ou da Meta Cloud API oficial, usa allowlist, prefixo opcional, fila duravel, dedupe, anti-flood por remetente e global, pausa em erro temporario do transporte, painel operacional com login opcional por `.env`, favicon proprio do Miauby e outbox. Desde 2026-06-03, automacoes, lembretes de Tarefa, Cotacao e Ferias tambem usam guarda de repeticao por origem/fingerprint/dedupe, inclusive quando chamadas com `notify=always`, para impedir flood por retry ou loop externo. O painel permite autorizar/bloquear remetentes no Postgres, ver/editar telefone completo na allowlist autenticada, ver o telefone completo resolvido na Sincronia recente logada, editar nome, liberar cards por contato, comparar mensagem recebida com resposta enviada e acompanhar/resolver erros abertos; fora dessas areas logadas, telefone continua mascarado. Contatos cadastrados aparecem minimizados para reduzir poluicao visual. Tambem exibe a demora total da resposta em 24h, latencia da IA e grafico simples de media/p95 por motor. O modo de IA pode ser `miauw`, `gemini` ou `hybrid`: no hibrido, conversa solta sem comando vai para Gemini quando o ambiente permite texto sem prefixo; com `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`, `gemini ...`, `barato ...` e `simples ...` acionam explicitamente o Gemini, enquanto `miauby ...` vai para o core Miauby/OpenAI com tools e guardrails. Quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, comandos operacionais detectados como `sangria 10 Will` tambem podem ir para o core. O core WhatsApp bloqueia tool quando o card detectado nao esta liberado para o telefone, considerando tambem o telefone real resolvido por `MIAUW_WHATSAPP_RECIPIENT_ALIASES` quando a Evolution entrega LID/alias. A allowlist compara DDI `55` e nono digito brasileiro para aceitar o mesmo numero com ou sem `9`; desconhecidos recebem apenas aviso curto indicando que o Miauby e interno e apontando para o atendimento oficial `(44) 98413-4971`, sem IA/core/comandos. Cache curto reduz repeticao; escritas fortes dependem de pendencia e confirmacao/auditoria do core, nunca de texto solto do Gemini. O repositorio mantem default seguro `MIAUW_WHATSAPP_ENABLED=false`; em producao o canal pode ser ativado por `.env` quando tokens/cifragem estiverem configurados. A stack separada da Evolution API tem template em `ops/evolution/` e roda no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`; para Meta, usar `MIAUW_WHATSAPP_PROVIDER=meta`.
- Desde 2026-06-05, quando `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`, texto solto de numero autorizado sem `miauby` responde apenas um menu local de ajuda, filtrado pelos cards liberados do contato. Esse caminho fica marcado como `prefix_missing_help_only`, nao chama Gemini/core/tools, nao executa parsers de PIX, sangria, pedidos ou tarefas, e nao cria pendencia operacional. A lista central de comandos ativos fica em `apps/miauw-whatsapp/src/command-help.ts` e deve funcionar como catalogo oficial do que o Miauby Whats pode fazer; o prompt Gemini tambem orienta a nao inventar comando fora dessa tabela. Desde 2026-06-05, esse menu mostra somente fluxos Whats fechados e validados por card, como Financeiro, Pedidos, Cotacao, Tarefas e Miauby/n8n; cards que ainda dependem de conversa generica/core, como Cashback, Gestao, XP e Codigos, ficam fora da tabela ate terem comando direto validado. A secao N8n do menu mostra apenas avisos que podem ser enviados para usuarios, com horario, card e destinatarios por usuario/display name, sem telefone nem status tecnico; rotinas internas ficam no painel/log.
- Em 2026-06-02, o painel `/miauw/whatsapp/` passou a priorizar leitura operacional simples: `Estado agora` resume canal, fila, integracao, resposta e erros; detalhes tecnicos como indicadores completos, allowlist, configuracao, estados, n8n, eventos e outbox ficam em secoes expansivas, e `Erros abertos` so abre automaticamente quando houver falha acionavel. Desde 2026-06-08, o painel `/miauby/whatsapp/` tambem usa resumos com contadores e deixa `Sincronia recente` e listas volumosas recolhidas/limitadas por padrao, mantendo apenas os sinais principais na tela inicial sem alterar webhook, fila, outbox, envio, n8n, tokens ou banco.
- Em 2026-06-02, a integracao Miauby interno x Miauby WhatsApp ganhou verificacao interna dedicada em `POST /miauw/whatsapp/internal/integration-status`, protegida por token. Ela nao envia mensagem real e nao executa escrita operacional; testa contexto PHP do Miauby, memoria Postgres do bridge, health do agente Node, fila/outbox, ultima mensagem enviada, ultimo evento de memoria e ultima falha acionavel. O painel `/miauw/whatsapp/` tambem ganhou card `Integracao Miauby` com alerta simples baseado nesses dados reais.
- Em 2026-06-02, a integracao com Evolution API ganhou verificacao interna dedicada em `POST /miauw/whatsapp/internal/evolution-status`, protegida por token. Ela nao envia mensagem real; consulta `connectionState`, `webhook/find`, pausa do provider, fila/outbox/eventos `evolution`, metadados da ultima mensagem enviada e ultima falha atual, mascarando URL de webhook e mantendo token, telefone cru, conteudo textual da mensagem e payload bruto fora da resposta. O painel `/miauw/whatsapp/` tambem mostra card `Evolution API` apontando para esse check.
- Desde 2026-05-30, timeouts pontuais do Baileys em `executeInitQueries`/`fetchProps` sao monitorados pelo script `ops/evolution/check-baileys-init-timeouts.sh`. Quando `connectionState=open` e `MESSAGES_UPSERT` continua chegando, isso e tratado como ruido de sincronizacao, nao como motivo para upgrade/recriacao da Evolution. Em `status=critical`, investigar e, se necessario, reiniciar apenas `wimifarma-evolution-api`.
- A allowlist do WhatsApp aceita numeros com ou sem DDI `55`, com espacos/pontuacao, com DDD completo ou apenas local de 8/9 digitos. Numeros locais usam `MIAUW_WHATSAPP_DEFAULT_DDD=44` por padrao e geram variantes com/sem nono digito; comparacao por sufixo exige pelo menos 8 digitos para nao liberar contato amplo por engano.
- Desde 2026-05-27, o bridge WhatsApp pode transcrever audios autorizados com Gemini e responder em audio por Gemini TTS quando as flags de audio estiverem ligadas. O padrao de voz usa `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr` e `MIAUW_WHATSAPP_AUDIO_TTS_STYLE` para uma leitura mais aguda/brilhante e levemente felina, sem clonagem de voz. O Git mantem audio desligado por padrao; o banco guarda metadados sanitizados e transcricao, nunca bytes de audio bruto.
- Em 2026-06-03, o audio de entrada do Miauby WhatsApp passou a seguir a mesma protecao do audio interno: a transcricao nao recebe lista de termos internos como pista, transcricoes que parecam glossario/seed ou longas demais para audio curto sao bloqueadas, o roteador nao executa comandos nesses casos e o WhatsApp pede uma frase mais clara ou texto manual. O evento/log registra apenas metadados sanitizados e motivo resumido.
- Desde 2026-05-27, o bridge WhatsApp pode ler foto, print, imagem encaminhada ou PDF/documento de comprovante Pix autorizado quando `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`. Ele baixa a midia somente em memoria, extrai dados com Gemini, confere o destino por CNPJ/chave Pix `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ` ou nome correlato em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES`, prepara um lancamento `Pix CNPJ` no Financeiro e exige confirmacao `Sim`/`Nao`; o banco nao guarda midia bruta nem URL/token. Antes de chamar OCR/Gemini, o contato precisa ter card `Financeiro` liberado. A flag manteve o nome `IMAGE` por compatibilidade, mas tambem cobre PDF/documento de comprovante; a leitura usa legenda/nome do arquivo como pista, reforca valor pago contra saldo/tarifa/limite e faz fallback deterministico para valor/data/hora quando o JSON vier incompleto. Desde 2026-06-01, CNPJ de destino diferente do configurado bloqueia a leitura, CNPJ achado apenas no texto bruto so vale em contexto de recebedor/destino, e o diagnostico salvo registra campos sanitizados, confiancas e ID Pix/E2E quando existir. Ainda em 2026-06-01, a etapa de velocidade descarta antes do OCR anexos com legenda/nome/extensao claramente nao Pix, guarda hash salgado do arquivo quando disponivel e bloqueia repeticao por arquivo ou ID Pix/E2E ja tratado nos ultimos 90 dias; imagem que nao parece comprovante recebe `Isso ai é um comprovante pix?` sem gerar pendencia. Em 2026-06-02, a resposta publica no WhatsApp ficou curta: confirmacao e pos-lancamento mostram apenas tipo, valor, responsavel, data/hora e status, enquanto detalhes de destino, pagador, instituicao, ID Pix e observacao completa continuam somente no payload sanitizado, pendencia e Financeiro. Em 2026-06-03, quando a midia aceita vem do perfil `Farmacia`, o bridge mostra resumo curto, abre `selecionar_responsavel_whatsapp` e so grava depois da escolha do humano, sem usar Farmacia nem pagador como responsavel. Em 2026-06-05, quando a midia falha ou fica incompleta, o Miauby responde de forma guiada que nao conseguiu ler com seguranca e orienta o formato manual `miauby pix cnpj valor responsavel`; o comando manual e parseado localmente, aceita `R$`, `28.90`, `28 reais`, responsavel antes/depois, observacao e typo `pix cpnj`, e grava pelo endpoint interno do Financeiro com `source=miauby_whatsapp`, `actor_user_id`, log sanitizado e idempotencia `whatsapp:pix-cnpj:{trace_id}`.
- Desde 2026-06-05, comprovante Pix CNPJ por midia so e aceito quando o CNPJ/chave Pix configurado aparece no destino/recebedor/chave; nome correlato virou apenas pista de OCR. Se nao achar esse CNPJ/chave, o Miauby responde `Nao achei nosso CNPJ nesse comprovante. Nao gravei nada.`. Quando aceita, o resumo publico tambem mostra o pagador extraido (`Feito por`) e `Tipo: foi no CNPJ`, mantendo detalhes completos apenas em payload/pendencia/Financeiro sanitizados. Campos opcionais de rastreio, como `transaction_id`, `end_to_end_id` e chave Pix do destino, nao bloqueiam a leitura quando valor, pagador e destino Wimifarma ja foram confirmados; se existirem, seguem salvos no diagnostico sanitizado e usados para dedupe.
- Desde 2026-06-08, o Pix CNPJ por midia usa `gemini-2.5-flash-lite` como OCR padrao quando `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL` nao for sobrescrito, limita tentativas por `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_DAILY_LIMIT` e pausa chamadas Gemini por `MIAUW_WHATSAPP_GEMINI_SPEND_GUARD_PAUSE_MINUTES` quando detectar spending cap, cota, billing ou 429. Nesses casos o WhatsApp orienta o lancamento manual `miauby pix cnpj valor responsavel`, sem trocar automaticamente para outro provedor pago. O painel mostra modelo, tentativas 24h, limite diario e status do guard. O fallback OpenAI fica apenas para falha transitoria de OCR, como timeout, 5xx ou resposta vazia, quando `MIAUW_OPENAI_API_KEY`/`MIAUW_WHATSAPP_OPENAI_API_KEY` estiver configurado.
- Confirmacoes por Evolution API usam sempre texto simples: `Responda SIM para gravar ou NAO para cancelar`, sem mostrar codigo curto. Isso evita o caso em que `sendButtons` retorna ID de sucesso, mas o WhatsApp normal/linked device mostra mensagem que nao carrega. Meta Cloud API pode continuar com botoes interativos; a flag antiga `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS` fica apenas como sinal diagnostico e nao ativa botoes na Evolution. Clique em botao Meta ou `SIM`/`NAO` confirma somente pendencia ativa no Postgres, sem executar texto solto.
- Saudacoes simples no WhatsApp, como `oi`, `ola`, `teste` e `status`, respondem localmente sem Gemini/core para reduzir latencia; audios repetidos podem reaproveitar cache curto de TTS. O painel `Miauby Whatsapp` mostra uma area `n8n automacoes` com as rotinas planejadas e os destinatarios calculados pelos cards da allowlist.
- LIDs da Evolution configurados em `MIAUW_WHATSAPP_RECIPIENT_ALIASES` ficam ocultos e protegidos na allowlist editavel do painel WhatsApp; o operador edita o telefone real vinculado, e o n8n calcula destinatarios apenas pelos contatos reais autorizados.
- Quando uma mensagem chega por `@lid` configurado em `MIAUW_WHATSAPP_RECIPIENT_ALIASES`, o painel/permissoes continuam usando o telefone real resolvido, mas o transporte responde pelo endereco original do chat para a resposta aparecer no mesmo WhatsApp que enviou a mensagem.
- O backend WhatsApp possui endpoints internos para n8n/pos-deploy (`/miauw/whatsapp/internal/smoke-check` e `/miauw/whatsapp/internal/watchdog`) e recuperacao de outbox: pendencias recentes podem ser reenviadas automaticamente, enquanto pendencias antigas viram `dead` para nao disparar mensagem fora de contexto depois de queda ou deploy. Tarefa, encomenda da Cotacao e rotinas n8n registram cada execucao em `miauw_whatsapp_automation_runs`; desde 2026-06-05, o watchdog e o alerta Evolution/Baileys ficam apenas como log interno nessa tabela e nao enviam alerta por WhatsApp. `miauw_whatsapp_error_logs` fica para falhas acionaveis e o painel nao conta `dead/stale_pending_expired`, `dead/codex_test_wrong_instance_resolved`, avisos de outbox recuperado nem tentativas transitorias ja respondidas como problema aberto. Destinatarios explicitos da encomenda da Cotacao sao validados contra allowlist e card `Cotacao` antes de qualquer envio.
- Desde 2026-06-07, lembrete de encomenda da Cotacao usa dedupe forte por `reminder_id` ja enviado no Miauby Whats e a chamada Cotacao -> WhatsApp espera 25s por padrao (`COTACAO_ENCOMENDA_REMINDER_WHATSAPP_TIMEOUT_MS`), evitando reenvio quando o provedor demora mas a primeira mensagem ja saiu.
- Em 2026-06-02, o n8n ganhou workflows versionados ativos para smoke pos-deploy (`miauby-smoke-check-pos-deploy`), watchdog a cada 5 min, alerta Evolution/Baileys a cada 30 min e resumo diario Pix/OCR as 19h10. Todos chamam endpoints internos tokenizados do bridge; URL/token vem de `$env`, sem segredo no JSON. O alerta Evolution/Baileys nao monta Docker socket nem executa shell no n8n; desde 2026-06-05, tambem nao envia WhatsApp e fica restrito a painel/log interno. O script `ops/evolution/check-baileys-init-timeouts.sh` continua como runbook de host para auditoria exata de logs.
- O n8n tambem pode chamar `POST /miauw/whatsapp/internal/pedidos-arrival-check` todo dia as 17h. O bridge consulta Pedidos, envia a tabela de `Aguardando chegada` para contatos autorizados com card `Pedidos`, usando o valor total do pedido, previsao de chegada quando houver e a data/hora persistida em `pedidos_orders.created_at`, ordenando os mais antigos primeiro; o painel mostra a rotina `Chegada de pedidos` com botao de pausar/ativar. Perguntas como `miauby em pedidos o que falta chegar`, `miauby pedidos`, `miauby pedidos abertos` e `miauby o que falta chegar` retornam a mesma tabela em formato curto, uma linha por pedido. Respostas como `cimed chegou` confirmam apenas a chegada pelo endpoint interno de Pedidos e deixam o boleto em `Confirmados` para pagar. Comandos como `miauby pedido anb 350`, `miauby distribuidora anb 350`, `miauby pedido anb 350 ja pago so chegar`, `miauby pedido anb 350 ja chegou so pagar`, `miauby pedido anb 350 pago e recebido` e `miauby pedido anb 2 parcelas 200 10/06 e 150 20/06` sao parseados localmente pelo bridge, sem Gemini, exigem allowlist/card `Pedidos`/usuario vinculado e criam o pedido pelo endpoint interno idempotente. Comandos como `miauby cancelar pedido anb`, `miauby cancelar pedido 350` ou `miauby nao precisa mais do pedido da anb` procuram apenas pedidos aguardando chegada; se houver varios, o bridge guarda uma escolha pendente por numero/texto e depois ainda exige `SIM/NAO`; se houver financeiro vinculado, a confirmacao avisa antes de arquivar/cancelar. Falta de fornecedor/valor, data passada ou status contraditorio nao grava; soma de parcelas divergente do total vira pendencia `SIM/NAO` vinculada ao ultimo comando daquele numero. Desde 2026-06-08, comandos operacionais autorizados que baterem no limite por minuto sao enfileirados com atraso curto em vez de descartados, e falha temporaria ao falar com Pedidos retorna fallback curto/log sanitizado em vez de deixar o WhatsApp sem resposta.
- O n8n tambem pode chamar `POST /miauw/whatsapp/internal/financeiro-cash-closing-reminder` todo dia as 18h. O bridge consulta Financeiro por `GET /financeiro/api/internal/cash-closing-status`, recebe o status do dia e a lista de caixas em aberto nos ultimos 10 dias ate a data consultada, e so envia lembrete para contatos autorizados com card `Financeiro` quando houver dia pendente para finalizar nessa janela. A mensagem informa o(s) dia(s) em aberto; se nao houver pendencia e o dia consultado estiver `fechado`, `divergente` ou `sem_movimento`, nao envia nada.
- O n8n fica documentado como automacao externa em `docs/23-n8n-automacoes.md`, com template em `ops/n8n/`. Ele deve agendar e orquestrar alertas de Pedidos, Financeiro, deploy/checks, Evolution/Baileys, Pix/OCR e webhooks do Miauby, mas nao deve escrever direto nos bancos de negocio nem pular confirmacao/auditoria.
- O WhatsApp e o Miauby interno compartilham contexto pelo endpoint interno tokenizado `site/miauw/agent-context.php`: o bridge busca `style_context`, treino aprovado, perfil de voz, contratos de tools e, desde 2026-06-03, `identity_context`, `text_command_contracts`/`text_command_training` antes de chamar `wimifarma-miauw-agent`. Todo comando textual criado no WhatsApp deve ganhar variacoes textuais para o interno quando fizer sentido; no WhatsApp segue `miauby ...`, enquanto no interno a forma direta como `sangria 10 troco`, `pix cnpj 28,90 compra fornecedor`, `pedido anb 350`, `pedidos`, `cancelar pedido anb`, `minhas tarefas`, `tarefa conferir caixa`, `concluir tarefa conferir caixa` ou `status do calendario` deve ser aprendida sem exigir prefixo. No Miauby interno, o responsavel padrao e sempre o usuario logado na sessao; no WhatsApp, o responsavel padrao vem do numero vinculado/allowlist. Usuario comum nao deve registrar acao em nome de outro sem permissao validada, e sem sessao valida no interno o comando nao executa. O Miauby interno nao le imagem, foto, PDF, audio ou comprovante; quando houver midia no WhatsApp, ele aprende apenas o fallback textual/manual. Para Calendario, o contrato textual e apenas leitura segura: o Miauby pode consultar resumo, cores e dias marcados, mas nao le texto completo nem edita anotacoes. Acoes fortes permitidas podem gerar uma pendencia no Postgres do bridge e uma confirmacao `Sim`/`Nao` no WhatsApp via `site/miauw/agent-actions.php`; a execucao vem desligada por padrao no repositorio e so deve ser ativada com allowlist e tools revisadas.
- Desde 2026-05-28, os dois canais tambem compartilham memoria curta sanitizada pelo Postgres do bridge WhatsApp, em `miauw_whatsapp_channel_events`, via `POST /miauw/whatsapp/internal/memory`. O PHP usa essa ponte por `MIAUW_CHANNEL_MEMORY_BRIDGE_URL` e mantem `site/miauw/agent-memory.php`/`miauw_channel_events` como fallback de compatibilidade. O interno grava mensagens/respostas, o WhatsApp grava turnos enviados sem travar a fila, e `agent-context.php` devolve `channel_memory` para Gemini/core manter continuidade. Essa memoria nao guarda telefone cru, payload bruto, audio/midia nem segredo.
- Miauby tambem entende comandos controlados da Gestao: `gestao` aponta para `/gestao/`, e aceita ordens como `gestao - titulo - 500 - categoria`, `gestao - 500 - titulo`, `gestao titulo 500` e categoria antes/depois; quando houver so nome + valor, usa categoria `geral`. Toda criacao prepara confirmacao humana antes de gravar pelo endpoint interno tokenizado da Gestao. Se um comando incompleto pedir correcao, uma nova mensagem iniciada por `gestao` substitui a pendencia anterior em vez de juntar prompts antigos.
- Miauby conhece o contexto do XP: `/xp/` e a trilha gamificada dos atendentes, R$ 1.000,00 em vendas gera 2.500 XP e "farmar aura no XP" e linguagem interna para incentivar venda real e lancamento correto, sem inventar ranking, nivel ou pontuacao.
- O painel restrito `/miauw/diagnostico.php` mostra falhas internas recentes do Miauby com `trace_id`, erro sanitizado, hash e contexto curto da ferramenta/confirmacao, permitindo investigar falhas automaticas sem expor segredo, SQL bruto ou stack trace ao operador.
- A navegacao superior do Miauby fica focada em Home, Chat, Treino e Diagnostico; atalhos diretos para Cashback, Cotacao, Financeiro e logout local foram removidos para deixar o modulo mais limpo e centralizar a saida na Home.
- O frontend de audio do Miauby tenta abrir o microfone por `getUserMedia()` mesmo quando o estado previo de permissao parece desatualizado; se o Chrome/Windows recusar, a mensagem indica recarregar/redefinir permissao ou revisar a permissao de microfone do sistema.
- Os headers de seguranca dos modulos internos permitem `microphone=(self)` para o audio do Miauby no proprio dominio, mantendo camera e geolocalizacao bloqueadas.
- O Miauby tem integracao documentada para WhatsApp via Evolution API ou Meta Cloud API: o transporte recebe mensagens por webhook e devolve respostas por API, mas o motor, permissoes, guardrails, confirmacoes e auditoria continuam no Miauby. A primeira versao deve usar allowlist de numeros e nao expor o numero publico do Cashback a respostas internas sem filtro.
- Miauby so alerta encomendas da Cotacao quando a linha esta com prioridade explicita `encomenda` e passou de 1 dia sem baixa/pedido; o comentario curto aparece no balao do widget em qualquer modulo onde o Miauby esteja carregado.
- A seguranca de base inclui CSRF nos formularios internos, headers de seguranca, bloqueio de `xmlrpc.php`, bloqueio de execucao em uploads versionados, bloqueio web direto de `wp-config.php`, metadados de plugins, dumps/backups/logs/chaves, limitador de login nos modulos PHP e na Cotacao V2, audit limpo de dependencias de producao em Cotacao/Miauby Agent, e varredura local de segredos por `scripts/check-secrets.ps1`.
- Desde 2026-06-02, `/miauw/agent/health` e publico apenas com resumo minimo para monitoramento; `/miauw/agent/status` e detalhado e exige token interno, assim como `run` e `stream`.

Pontos ainda pendentes ficam registrados em `docs/06-pendencias.md`.

## Stack

- PHP 8.3 com Apache
- MySQL 8.0
- WordPress na raiz publica `site/`
- Modulos internos PHP remanescentes para Miauby e WordPress/tema; os modulos de operacao principais estao sendo cortados para Node.js/TypeScript/Postgres por dominio.
- Docker Compose
- Nginx Proxy Manager no VPS para publicar dominios
- OpenAI API usada pelo Miauby
- Node.js 22 + Express + Socket.IO para Cotacao V2
- Node.js 22 + TypeScript + Express para Cashback, Gestao, Pedidos, Tarefa, XP, Codigos, Calendario, Financeiro, Usuarios e Login / Senha
- Node.js 22 + TypeScript + Agents SDK para Miauby em modo sombra/corte controlado com adaptador PHP, tools Node por ponte PHP interna, contexto de treino aprovado, perfil compilado, perfis de voz/tom e audio por gravacao temporaria/transcricao confirmada, bolha/player de audio, resposta falada temporaria e seletor seguro de voz no diagnostico
- Node.js 22 + TypeScript para o bridge WhatsApp do Miauby via Evolution API ou Meta Cloud API
- PostgreSQL 17 para o core compartilhado de autenticacao
- PostgreSQL 17 para dados do Cashback
- PostgreSQL 17 para dados da Cotacao V2
- PostgreSQL 17 para dados do XP
- PostgreSQL 17 para dados de Codigos
- PostgreSQL 17 para dados do Calendario
- PostgreSQL 17 para dados do Financeiro
- PostgreSQL 17 dedicado para fila/eventos/outbox do Miauby WhatsApp
- Redis 7 para sessoes e presenca da Cotacao V2

## Instalar localmente

### Em outro PC com Codex

Se o projeto ainda nao existir nesse computador, peça ao Codex:

```text
Puxe o projeto Wimifarma do GitHub em C:\Users\Thiesen\Desktop\wimifarma-com e siga o AGENTS.md.
Repositorio: https://github.com/WilliYY/wimifarma-com.git
```

O comportamento esperado esta documentado em `AGENTS.md` e `docs/05-comandos.md`: clonar quando a pasta nao existe; se ela ja existir, fazer `git fetch`, conferir se nao ha alteracoes locais e so entao `git pull --ff-only origin main`. Segredos como `.env`, `config.local.php`, bancos e volumes nao vem do Git e precisam ser configurados por fonte segura da maquina/servidor.

1. Entrar na pasta do projeto:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
```

2. Criar o `.env` local a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

3. Editar `.env` com valores reais do ambiente local. Nunca versionar `.env`.

4. Opcionalmente configurar o Miauby por arquivo local:

```powershell
Copy-Item site\miauw\config.local.example.php site\miauw\config.local.php
```

Depois editar `site\miauw\config.local.php`. Esse arquivo tambem nao deve ser versionado.

## Como rodar

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas principais:

- `http://127.0.0.1:3002/cashback/login.php`
- `http://127.0.0.1:3002/cashback/health`
- `http://127.0.0.1:3002/codigos/login.php`
- `http://127.0.0.1:3002/cotacao/login.php`
- `http://127.0.0.1:3002/financeiro/login.php`
- `http://127.0.0.1:3002/usuarios/login.php`
- `http://127.0.0.1:3002/usuarios/health`
- `http://127.0.0.1:3002/gestao/login.php`
- `http://127.0.0.1:3002/gestao/health`
- `http://127.0.0.1:3002/pedidos/`
- `http://127.0.0.1:3002/pedidos/health`
- `http://127.0.0.1:3002/xp/login.php`
- `http://127.0.0.1:3002/xp/health`
- `http://127.0.0.1:3002/tarefa/login.php`
- `http://127.0.0.1:3002/tarefa/health`
- `http://127.0.0.1:3002/miauw/login.php`
- `http://127.0.0.1:3002/miauw/treino.php`
- `http://127.0.0.1:3002/miauw/diagnostico.php`
- `http://127.0.0.1:3002/miauw/widget-status.php`
- `http://127.0.0.1:3002/miauw/agent/health`
- `http://127.0.0.1:3002/miauw/whatsapp/`
- `http://127.0.0.1:3002/miauw/whatsapp/health`

## Comandos principais

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker compose logs --tail=80 wimifarma-cashback-app
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-pedidos-app
docker compose logs --tail=80 wimifarma-tarefa-app
docker compose logs --tail=80 wimifarma-miauw-agent
docker compose logs --tail=80 wimifarma-miauw-whatsapp
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
powershell -ExecutionPolicy Bypass -File scripts/check-secrets.ps1
cd apps/miauw-agent; npm.cmd run check:persona; cd ../..
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -sS http://127.0.0.1:3002/cashback/health
curl.exe -L --max-time 30 http://127.0.0.1:3002/gestao/login.php
curl.exe -sS http://127.0.0.1:3002/pedidos/health
curl.exe -sS http://127.0.0.1:3002/tarefa/health
curl.exe -sS http://127.0.0.1:3002/miauw/agent/health
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/health
curl.exe -sS http://127.0.0.1:3002/usuarios/health
curl.exe -sS http://127.0.0.1:3002/cotacao/health
curl.exe -sS http://127.0.0.1:3002/cotacao/api/diagnostics
curl.exe -sS http://127.0.0.1:3002/cotacao/api/google-sheets/status
```

Mais comandos ficam em `docs/05-comandos.md`.

## Estrutura de pastas

```text
.
|-- apps/
|   |-- cashback/            # Cashback Node.js/TypeScript/Postgres oficial
|   |-- cotacao/             # Cotacao V2 Node.js/Socket.IO
|   |-- gestao/              # Gestao Node.js/TypeScript/Postgres
|   |-- pedidos/             # Pedidos Node.js/TypeScript, separado de Gestao
|   |-- tarefa/              # Tarefa Node.js/TypeScript/Postgres
|   |-- xp/                  # XP Node.js/TypeScript/Postgres oficial
|   |-- codigos/             # Codigos Node.js/TypeScript/Postgres oficial
|   |-- calendario/          # Calendario Node.js/TypeScript/Postgres oficial
|   |-- financeiro/          # Financeiro Node.js/TypeScript/Postgres oficial
|   |-- usuarios/            # Usuarios Node.js/TypeScript no core Postgres
|   |-- login-senha/         # Cofre Login / Senha Node.js/TypeScript/Postgres
|   |-- miauw-agent/         # Miauby agente Node/TypeScript em sombra/corte controlado
|   |-- miauw-whatsapp/      # Bridge WhatsApp Node/TypeScript com painel operacional
|   `-- miauby/              # Migrador sombra do Miauby interno para Postgres
|-- ops/
|   `-- evolution/           # Template da stack Evolution API separada
|-- cotacao-data/            # volumes Postgres/Redis ignorados pelo Git
|-- cashback-data/           # volume Postgres do Cashback ignorado pelo Git
|-- gestao-data/             # volume Postgres da Gestao ignorado pelo Git
|-- tarefa-data/             # volume Postgres do Tarefa ignorado pelo Git
|-- xp-data/                 # volume Postgres do XP ignorado pelo Git
|-- codigos-data/            # volume Postgres de Codigos ignorado pelo Git
|-- calendario-data/         # volume Postgres do Calendario ignorado pelo Git
|-- financeiro-data/         # volume Postgres do Financeiro ignorado pelo Git
|-- login-senha-data/        # volume Postgres do cofre Login / Senha ignorado pelo Git
|-- docker/
|   |-- php/Dockerfile
|   `-- mysql/init/
|-- docs/
|-- mysql/                  # volume local ignorado pelo Git
|-- site/
|   |-- home.php              # home publica estavel, fora do bootstrap WordPress
|   |-- cashback/             # legado/assets; rota oficial usa apps/cashback por proxy
|   |-- codigos/              # legado/assets; rota oficial usa apps/codigos por proxy
|   |-- financeiro/
|   |-- gestao/               # legado PHP; rota oficial usa apps/gestao por proxy
|   |-- miauw/
|   |-- xp/                   # modulo XP dos atendentes, com fotos validadas e trilha de niveis
|   |-- tarefa/               # legado PHP/assets historicos; rota oficial usa apps/tarefa por proxy
|   |-- wp-admin/
|   |-- wp-content/
|   |-- wp-includes/
|   `-- wp-config.php
|-- .env.example
|-- docker-compose.yml
|-- AGENTS.md
`-- README.md
```

## Variaveis de ambiente

Variaveis esperadas em `.env`:

```text
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
WIMIFARMA_DB_HOST
WIMIFARMA_DB_USER
WIMIFARMA_DB_PASSWORD
WIMIFARMA_WP_DB_NAME
WIMIFARMA_APP_DB_NAME
RSSSL_KEY
WP_AUTH_KEY
WP_SECURE_AUTH_KEY
WP_LOGGED_IN_KEY
WP_NONCE_KEY
WP_AUTH_SALT
WP_SECURE_AUTH_SALT
WP_LOGGED_IN_SALT
WP_NONCE_SALT
WP_CACHE
WIMIFARMA_PUBLIC_PAGE_CACHE
CODIGOS_GROUP_DELETE_PASSWORD
CODIGOS_POSTGRES_PASSWORD
CODIGOS_SESSION_SECRET
CODIGOS_INTERNAL_TOKEN
CODIGOS_INTERNAL_BASE_URL
CASHBACK_POSTGRES_PASSWORD
CASHBACK_SESSION_SECRET
CASHBACK_INTERNAL_TOKEN
CASHBACK_INTERNAL_BASE_URL
MIAUW_OPENAI_API_KEY
MIAUW_WHATSAPP_OPENAI_API_KEY
MIAUW_WHATSAPP_OPENAI_API_BASE_URL
MIAUW_WHATSAPP_OPENAI_MODEL
MIAUW_WHATSAPP_PIX_RECEIPT_OPENAI_MODEL
MIAUBY_POSTGRES_PASSWORD
MIAUBY_INTERNAL_TOKEN
MIAUBY_WRITES_ENABLED
MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED
MIAUBY_WRITE_ADAPTER_AUDIT_ENABLED
MIAUBY_WRITE_SHADOW_ENABLED
MIAUBY_WRITE_SHADOW_ALLOWED_USERS
MIAUBY_WRITE_ADAPTER_INTERNAL_URL
MIAUBY_WRITE_SHADOW_TIMEOUT_MS
MIAUW_OPENAI_MODEL
MIAUW_GUARDIAN_TOKEN
MIAUW_AGENT_INTERNAL_TOKEN
MIAUW_AGENT_INTERNAL_BASE_URL
MIAUW_PHP_TOOL_BRIDGE_URL
MIAUW_AGENT_SHADOW_ON_SEND
MIAUW_AGENT_SHADOW_TIMEOUT_MS
MIAUBY_ENGINE
MIAUW_ENGINE
MIAUW_AGENT_ENGINE_ALLOWED_USERS
MIAUW_MAINTENANCE_MODE
MIAUW_MAINTENANCE_ALLOWED_USERS
MIAUW_MAINTENANCE_MESSAGE
MIAUW_VOICE_PROFILE
MIAUW_AUDIO_ENABLED
MIAUW_TRANSCRIPTION_MODEL
MIAUW_SPEECH_MODEL
MIAUW_SPEECH_VOICE
MIAUW_REALTIME_MODEL
MIAUW_REALTIME_VOICE
MIAUW_WHATSAPP_ENABLED
MIAUW_WHATSAPP_POSTGRES_PASSWORD
MIAUW_WHATSAPP_WEBHOOK_TOKEN
MIAUW_WHATSAPP_INTERNAL_TOKEN
MIAUW_WHATSAPP_ENCRYPTION_KEY
MIAUW_WHATSAPP_HASH_SALT
MIAUW_WHATSAPP_ALLOWED_SENDERS
MIAUW_WHATSAPP_DASHBOARD_USER
MIAUW_WHATSAPP_DASHBOARD_PASSWORD
MIAUW_WHATSAPP_DASHBOARD_SESSION_TTL_MINUTES
MIAUW_WHATSAPP_DEFAULT_DDD
MIAUW_WHATSAPP_REQUIRE_PREFIX
MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX
MIAUW_WHATSAPP_PREFIX
MIAUW_WHATSAPP_GROUPS_ENABLED
MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND
MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE
MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY
MIAUW_WHATSAPP_TAREFA_INTERNAL_BASE_URL
MIAUW_WHATSAPP_TAREFA_INTERNAL_TOKEN
MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS
MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS
MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE
MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS
MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS
MIAUW_WHATSAPP_AI_MODE
MIAUW_WHATSAPP_GEMINI_MODEL
MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS
MIAUW_WHATSAPP_GEMINI_TEMPERATURE_X100
MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET
MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED
MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED
MIAUW_WHATSAPP_AUDIO_REPLY_MODE
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_PROVIDER
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_MODEL
MIAUW_WHATSAPP_AUDIO_TTS_PROVIDER
MIAUW_WHATSAPP_AUDIO_TTS_MODEL
MIAUW_WHATSAPP_AUDIO_TTS_VOICE
MIAUW_WHATSAPP_AUDIO_TTS_STYLE
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_TIMEOUT_MS
MIAUW_WHATSAPP_AUDIO_TTS_TIMEOUT_MS
MIAUW_WHATSAPP_AUDIO_MAX_BYTES
MIAUW_WHATSAPP_AUDIO_TTS_MAX_CHARS
MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED
MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ
MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES
MIAUW_WHATSAPP_PIX_RECEIPT_MIN_TARGET_SCORE_X100
MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL
MIAUW_WHATSAPP_PIX_RECEIPT_OCR_DAILY_LIMIT
MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_MAX_BYTES
MIAUW_WHATSAPP_PIX_RECEIPT_OCR_TIMEOUT_MS
MIAUW_WHATSAPP_GEMINI_SPEND_GUARD_PAUSE_MINUTES
MIAUW_WHATSAPP_CONTEXT_PACK
MIAUW_WHATSAPP_CONTEXT_URL
MIAUW_WHATSAPP_CONTEXT_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_CONTEXT_TIMEOUT_MS
MIAUW_WHATSAPP_ACTIONS_URL
MIAUW_WHATSAPP_ACTIONS_TIMEOUT_MS
MIAUW_WHATSAPP_CONFIRMATIONS_ENABLED
MIAUW_WHATSAPP_INTERACTIVE_CONFIRMATIONS
MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED
MIAUW_WHATSAPP_CONFIRMATION_TTL_MINUTES
MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST
MIAUW_WHATSAPP_ACTOR_USER_ID
MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_RECIPIENT_ALIASES
MIAUW_WHATSAPP_PROVIDER
GEMINI_API_KEY
GEMINI_API_BASE_URL
EVOLUTION_API_BASE_URL
EVOLUTION_API_KEY
EVOLUTION_API_INSTANCE
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
META_WHATSAPP_APP_SECRET
META_WHATSAPP_GRAPH_API_VERSION
COTACAO_INTERNAL_TOKEN
COTACAO_INTERNAL_BASE_URL
GESTAO_INTERNAL_TOKEN
GESTAO_INTERNAL_BASE_URL
GESTAO_POSTGRES_PASSWORD
GESTAO_SESSION_SECRET
USUARIOS_SESSION_SECRET
USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL
USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN
USUARIOS_INTERNAL_HTTP_TIMEOUT_MS
PEDIDOS_SESSION_SECRET
PEDIDOS_CORE_AUTH_TIMEOUT_MS
TAREFA_POSTGRES_PASSWORD
TAREFA_SESSION_SECRET
TAREFA_INTERNAL_TOKEN
TAREFA_CORE_AUTH_TIMEOUT_MS
TAREFA_MIAUW_WHATSAPP_INTERNAL_BASE_URL
TAREFA_MIAUW_WHATSAPP_INTERNAL_TOKEN
TAREFA_MIAUW_WHATSAPP_TIMEOUT_MS
TAREFA_REMINDER_WORKER_INTERVAL_MS
TAREFA_REMINDER_RETRY_DELAY_MINUTES
TAREFA_REMINDER_MAX_ATTEMPTS
XP_POSTGRES_PASSWORD
XP_SESSION_SECRET
COTACAO_POSTGRES_PASSWORD
COTACAO_SESSION_SECRET
COTACAO_BACKUP_DIR
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_RANGE
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE
```

Nao colocar valores reais no README, em commits ou em issues publicas.

## Arquivos fora do Git

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`
- `tarefa-data/`
- `cashback-data/`
- `miauby-data/`
- `xp-data/`
- `node_modules/`

## Deploy no VPS

O VPS atual usa Ubuntu/Oracle, PuTTY para terminal e WinSCP para arquivos. O Codex tambem pode executar deploy diretamente por SSH/plink com a chave local autorizada, entao nao e necessario enviar comando PuTTY equivalente ao usuario ao final.

Pasta observada no VPS:

```bash
/home/ubuntu/projetos/wimifarma-com
```

Essa deve ser a pasta oficial unica de deploy. Copias temporarias criadas durante a migracao, como `wimifarma-com-git`, `wimifarma-com-code-*` ou `wimifarma-com-runti*`, devem ser auditadas pelos mounts dos containers e arquivadas em `_arquivados-wimifarma/` antes de qualquer exclusao.

Quando o VPS estiver usando Git para este projeto, o fluxo padrao executado pelo Codex/operador sera:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
```

Antes do primeiro deploy do Cashback Node/Postgres no VPS, adicionar valores reais no `.env` para `CASHBACK_POSTGRES_PASSWORD`, `CASHBACK_SESSION_SECRET` e, se o Miauby for consultar resumo interno, `CASHBACK_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`. O app usa Postgres como fonte unica e login unico no core; desde 2026-05-30 nao ha flags, dependencia `mysql2`, importador ou espelho MySQL no Cashback. Rollback para MySQL exige restaurar commit/imagem anterior e usar backup validado.

Antes do primeiro deploy da Cotacao V2 no VPS, adicionar valores reais no `.env` para `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET`.

Para o Miauby criar/consultar encomendas diretamente na Cotacao V2, manter `MIAUW_GUARDIAN_TOKEN` preenchido ou definir `COTACAO_INTERNAL_TOKEN` com token equivalente no `.env`; o Compose entrega esse segredo ao web/PHP e ao app Node sem versionar o valor.

Para testar o servico Miauby agente, manter `MIAUW_AGENT_INTERNAL_TOKEN` preenchido ou usar o fallback de `MIAUW_GUARDIAN_TOKEN`; `MIAUW_AGENT_INTERNAL_BASE_URL` aponta internamente para `http://wimifarma-miauw-agent:3100/miauw/agent` e `MIAUW_PHP_TOOL_BRIDGE_URL` aponta para `http://wimifarma-com-web/miauw/agent-tools.php`.

Para iniciar ou atualizar a migracao sombra do Miauby interno, definir `MIAUBY_POSTGRES_PASSWORD` por ambiente, manter `wimifarma-com-db` e `wimifarma-miauby-db` ativos, e rodar `sh scripts/miauby-shadow-migrate.sh migrate` seguido de `sh scripts/miauby-shadow-migrate.sh validate`. Esse script constroi e executa um `wimifarma-miauby-migrator` descartavel com `--no-deps`, para que o runtime `wimifarma-miauby-app` continue sem credenciais/conexao MySQL. O migrador de `apps/miauby` copia tabelas `miauw_*` para tabelas `miauby_*` com `legacy_mysql_id`, checksum e payload sanitizado, cria tambem `miauby_write_intents` e `miauby_write_audit_events`, e grava o resultado em `miauby_migration_runs`. `MIAUBY_INTERNAL_TOKEN` protege os endpoints internos do `wimifarma-miauby-app`; quando vazio, o servico pode reutilizar `MIAUW_GUARDIAN_TOKEN` ou `MIAUW_AGENT_INTERNAL_TOKEN`. O app responde apenas na rede Docker em `wimifarma-miauby-app:4100`, sem proxy Apache/publico, e expoe `/miauby/health`, `/miauby/api/internal/status`, `/miauby/api/internal/parity`, `/miauby/api/internal/readiness`, `/miauby/api/internal/context`, `/miauby/api/internal/cutover`, `/miauby/api/internal/canonical-context` e os endpoints internos do adaptador em `/miauby/api/internal/write-adapter`. Readiness/parity usam o ultimo `validate` salvo no Postgres em vez de abrir MySQL ao vivo. O alias interno `/miauby/api/internal/context-pack` aponta para o mesmo pacote canonico. Na Etapa 5A, esse pacote inclui `canonical_read_model`, persona, treino aprovado, memorias/padroes aprovados, conhecimentos ativos/aprovados e contratos de tools, mantendo `php_official_response=true` e escrita desligada. Na Etapa 5C, `MIAUBY_WRITES_ENABLED=false` continua bloqueando escrita real; `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true` permite somente registrar dry-run no Postgres do Miauby, e `MIAUBY_WRITE_SHADOW_ENABLED=true` faz o PHP oficial enviar intencoes sanitizadas apos gravar a mensagem no MySQL. Validar inicialmente apenas com `MIAUBY_WRITE_SHADOW_ALLOWED_USERS=adm`. Rollback segue por env (`MIAUBY_WRITE_SHADOW_ENABLED=false`, `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false`, `MIAUBY_WRITES_ENABLED=false`, `MIAUW_ENGINE=php`) sem mexer em `/miauw/`. O smoke automatizado fica em `scripts/miauby-shadow-smoke.sh`.

Para comparar respostas do PHP com o servico sombra em envios reais, ligar `MIAUW_AGENT_SHADOW_ON_SEND=true` e manter `MIAUW_AGENT_SHADOW_TIMEOUT_MS` com limite baixo o suficiente para nao atrapalhar a equipe. O padrao documentado fica `false`.

Para corte controlado do Miauby por usuario, use `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e escolha `MIAUBY_ENGINE=node_shadow` para comparacao ou `MIAUBY_ENGINE=node` para resposta oficial Node apenas do `adm`. `MIAUW_ENGINE` continua como fallback legado. A escrita segue PHP/MySQL ate a etapa propria de Postgres. Valide com `sh scripts/miauby-node-cutover-smoke.sh node` e rollback rapido e voltar `MIAUBY_ENGINE=php`/`MIAUW_ENGINE=php`; se usar manutencao, `MIAUW_MAINTENANCE_MODE=false`.

Para audio do Miauby, `MIAUW_AUDIO_ENABLED=true` libera o botao de fala no chat e no widget global. O fluxo atual grava audio temporario no navegador, envia para o PHP transcrever com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, mostra um rascunho local com player, duracao e transcricao, coloca o texto no campo e so manda ao Miauby quando o usuario apertar `Enviar`; depois de enviado, a bolha mostra o player/ondas e nao o texto transcrito. Quando a entrada veio por audio, o PHP pode gerar resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts`; a voz base vem de `MIAUW_SPEECH_VOICE` ou do seletor restrito em `/miauw/diagnostico.php`. O player usa `blob:` temporario liberado apenas em `media-src`, a transcricao da resposta fica escondida por padrao e o audio nao e gravado no banco/disco. Gravacoes curtas demais e transcricoes que parecam glossario interno inventado sao bloqueadas, e `Refazer`/`Descartar audio` continuam limpando o rascunho. `MIAUW_REALTIME_MODEL` e `MIAUW_REALTIME_VOICE` ficam preservados para evolucao futura de conversa realtime.

Para o Miauby WhatsApp, `/miauw/whatsapp/` mostra o painel operacional seguro com canal, transporte, fila, outbox, allowlist editavel/minimizada, cards liberados por contato, sincronia recente, status de OCR Pix CNPJ, erros abertos com acao de resolver, graficos simples de latencia por motor e eventos recentes. A allowlist logada pode mostrar o telefone completo para correcao, e a Sincronia recente logada mostra o numero completo resolvido por alias para diferenciar LID da Evolution do telefone real; fora dessas areas, o painel continua mascarado. Em producao, proteger o painel com `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`; quando o operador ja esta na Home com `WFHOME_SSO`, o painel entra direto apenas se `core_users` estiver ativo e o login for `adm`/`admin` ou tiver permissao individual `miauw_whatsapp`, mantendo o login do dashboard como fallback. `/miauw/whatsapp/health` continua publico e sem segredo. O default do repositorio continua `MIAUW_WHATSAPP_ENABLED=false`; no VPS, ligar `MIAUW_WHATSAPP_ENABLED=true` apenas quando token de webhook/verificacao, cifragem, allowlist e transporte (`evolution` ou `meta`) estiverem revisados. Com `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`, texto solto de remetente autorizado responde somente menu de ajuda e nao executa acao. Para comandos operacionais sem prefixo, manter `MIAUW_WHATSAPP_REQUIRE_PREFIX=false` e `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true` somente com allowlist/cards liberados e confirmacoes ativas.

Para Tarefa, manter `TAREFA_POSTGRES_PASSWORD`, `TAREFA_SESSION_SECRET` e `TAREFA_INTERNAL_TOKEN` no `.env` de cada ambiente. O corte oficial de `/tarefa/` usa `wimifarma-tarefa-app:3500` por proxy Apache, `core_users` como login unico e `wimifarma_tarefa` como fonte oficial. Para lembretes Miauby, configurar `TAREFA_MIAUW_WHATSAPP_INTERNAL_BASE_URL` e um token em `TAREFA_MIAUW_WHATSAPP_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`; o envio exige contato vinculado ao usuario no Miauby WhatsApp com card `tarefas` liberado. O timeout recomendado para essa chamada e `TAREFA_MIAUW_WHATSAPP_TIMEOUT_MS=25000`, para respeitar o anti-flood do bridge; `TAREFA_REMINDER_IN_FLIGHT_GRACE_MINUTES=15` evita reprocessar uma tentativa ainda em andamento. Para comandos de Tarefas pelo Miauby WhatsApp, o bridge usa `MIAUW_WHATSAPP_TAREFA_INTERNAL_BASE_URL` ou `TAREFA_INTERNAL_BASE_URL` e `MIAUW_WHATSAPP_TAREFA_INTERNAL_TOKEN` ou `TAREFA_INTERNAL_TOKEN`, revalidando `actor_user_id` no app Tarefa. O Compose precisa repassar esse token ao `wimifarma-miauw-whatsapp`; se faltar, `miauby tarefas` chega ao worker mas a consulta interna morre com `401 unauthorized`. O parser aceita datas simples (`hoje`, `amanha`, dias da semana, `dd/mm` e horarios como `15h`, `15:30`, `cedo`, `tarde`, `noite`) e envia lembrete apenas quando a tarefa tem usuario privado. Desde 2026-05-30 nao ha `TAREFA_AUTH_PROVIDER`, flags `TAREFA_LEGACY_MYSQL_*`, importador, espelho, fallback `wf_users` ou dependencia `mysql2`; rollback MySQL exige restaurar versao anterior e backup validado.

Para XP, `apps/xp` e `wimifarma-xp-app:3600` sao a rota oficial `/xp/` via proxy Apache. Manter `XP_POSTGRES_PASSWORD` e `XP_SESSION_SECRET` por ambiente; o login usa somente `core_users`. Desde 2026-05-30 nao ha `XP_AUTH_PROVIDER`, flags `XP_LEGACY_MYSQL_*`, importador, espelho, logs, fallback `wf_users` ou dependencia `mysql2`; rollback MySQL exige restaurar versao anterior e backup validado.

Para Codigos, `apps/codigos` e `wimifarma-codigos-app:3700` sao a rota oficial `/codigos/` via proxy Apache. Manter `CODIGOS_POSTGRES_PASSWORD` e `CODIGOS_SESSION_SECRET` por ambiente; o login usa somente `core_users`. `CODIGOS_INTERNAL_TOKEN` pode ficar igual ao `MIAUW_GUARDIAN_TOKEN` para o Miauby ler Codigos direto do Postgres por endpoint interno. Desde 2026-05-30 nao ha `CODIGOS_AUTH_PROVIDER`, flags `CODIGOS_LEGACY_MYSQL_*`, importador, espelho, logs, fallback `wf_users` ou dependencia `mysql2`; rollback MySQL exige restaurar versao anterior e backup validado.

Para Calendario, `apps/calendario` e `wimifarma-calendario-app:4105` atendem a rota oficial `/calendario/` via proxy Apache. O app usa `wimifarma_calendario` para anos, cores nomeadas, anotacoes por dia, revisoes de anotacao, auditoria e sessao `WFCALENDARIO`; as imagens mensais vieram de `Calendario.pdf` e ficam em `apps/calendario/public/months`. A arte mensal ja contem o ano `2026` e os numeros dos dias, entao a camada web so cria areas editaveis alinhadas aos quadrados impressos, sem redesenhar esses textos sobre a imagem. A escrita e a pintura dos dias ficam dentro do quadrado impresso como camada translucida em lavagem suave tipo marcador, com texto estilo anotacao e sem corretor visual nos campos, preservando autosave, CSRF, POSTs e banco. O frontend mantem a selecao visual do dia sincronizada ao clicar direto na caixa, usa botoes de mes com entidades HTML para evitar mojibake e layout mais compacto com cabecalho introdutorio reduzido, controles de mes agrupados, acoes alinhadas a direita e painel lateral fixo no desktop; textos longos sem espaco no painel lateral e no resumo quebram para baixo, sem rolagem horizontal, e deixar o mouse parado sobre um dia com anotacao mostra o texto completo em tooltip. Desde 2026-06-08, esse painel lateral usa blocos mais compactos para cabecalho, anotacao e texto completo, swatches circulares e altura ajustada ao conteudo para deixar o foco na arte do calendario sem alterar autosave, paleta, botao direito, CSRF, POSTs ou banco. O botao direito sobre uma caixa abre uma paleta flutuante para pintar ou limpar a cor daquele dia usando as mesmas cores nomeadas e o mesmo autosave de `/calendario/api/day`. Esse autosave usa timers por dia para nao cancelar uma anotacao pendente quando o operador digita em outro dia, alem de transacao, lock por dia, checagem de `updated_at` contra aba antiga e historico `calendario_day_note_revisions` com antes/depois de texto e cor; ao trocar ano ou criar proximo calendario, o frontend tenta salvar pendencias antes de carregar outro calendario. Arquivar cor tambem registra revisoes dos dias afetados antes de limpar o vinculo. A paleta inferior usa swatches visuais sem texto aparente, preservando os nomes das cores para acessibilidade/titulos e para o banco. A imagem mensal pode ser segurada e arrastada horizontalmente com feedback visual de `grab/grabbing`, movendo imagem e camada editavel juntas e fazendo a troca de mes com animacao lateral de saida/entrada, respeitando `prefers-reduced-motion`, sem mexer em dados salvos. `CALENDARIO_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` libera apenas o resumo interno `/calendario/api/internal/summary` para o Miauby, sem expor texto completo; desde 2026-06-07 esse resumo tambem inclui contexto operacional, recursos, regras de privacidade, contagens por mes, cores e atualizacoes recentes sem texto, e a tool `resumo_calendario` usa essa saida segura.

Decisao para 2027 no Calendario: quando o usuario trouxer o novo modelo/PDF feito no Canva, trocar somente a referencia visual, as imagens mensais e os alinhamentos necessarios da camada editavel. As mesmas features de 2026 devem continuar: autosave em Postgres, revisoes, paleta, pintura por botao direito, tooltip de texto completo, arraste/troca de mes, permissoes, criacao de ano limpo e resumo seguro para o Miauby.

Para Financeiro, `apps/financeiro` e `wimifarma-financeiro-app:3800` sao a rota oficial `/financeiro/` via proxy Apache. Manter `FINANCEIRO_POSTGRES_PASSWORD`, `FINANCEIRO_SESSION_SECRET` e, se quiser trocar a senha de reabertura, `FINANCEIRO_REOPEN_PASSWORD` por ambiente. O login usa somente `core_users`; rollback MySQL exige restaurar versao/imagem anterior e backup validado. `FINANCEIRO_INTERNAL_TOKEN` pode ficar igual ao `MIAUW_GUARDIAN_TOKEN` para o Miauby/WhatsApp gravar `Pix CNPJ` e faturamento por endpoints internos Node/Postgres.

Para Usuarios, `apps/usuarios` e `wimifarma-usuarios-app:3900` sao a rota oficial `/usuarios/` via proxy Apache. Manter `USUARIOS_SESSION_SECRET` por ambiente; o app usa `CORE_POSTGRES_PASSWORD`, consulta o Postgres do XP para associar logins a funcionarios e chama Miauby WhatsApp por `USUARIOS_MIAUW_WHATSAPP_INTERNAL_*` para vincular/remover numeros da allowlist. Tarefas privadas devem ser criadas pelo modulo `/tarefa/`. O painel fica restrito a `adm` ou role `admin`.

Para Login / Senha, `apps/login-senha` e `wimifarma-login-senha-app:3950` atendem a rota oficial `/login-senha/` via proxy Apache; a aba restrita `Contas` usa `/login-senha-adm/` e `scope='adm'`, visivel apenas para `adm`, `admin` ou `gerente`. Manter `LOGIN_SENHA_POSTGRES_PASSWORD`, `LOGIN_SENHA_SESSION_SECRET` e, em producao, `LOGIN_SENHA_VAULT_KEY` por ambiente. O banco dedicado `wimifarma_login_senha` guarda `login_senha_entries`, `login_senha_audit_events` e sessoes. Senhas nunca devem aparecer em logs, console, erro ou documentacao. O modulo usa `core_users`/`WFHOME_SSO`; o cofre comum exige permissao explicita `login_senha` para usuario comum.

Para usar import/export real com Google Sheets, preencher tambem `GOOGLE_SHEETS_SPREADSHEET_ID` e uma credencial de service account em `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`. Sem essas variaveis, a tela mostra o status como nao configurado e nao tenta sincronizar.

Depois do deploy, a home publica deve provar que esta na versao certa:

```bash
curl -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl -I https://wimifarma.com/home.php
```

O header esperado e `X-Served-By: wimifarma-static-home`. Se `home.php` der 404 no dominio publico, o VPS/proxy ainda esta servindo uma copia antiga ou outro container.

Portas importantes:

- container/proxy interno: `wimifarma-com-web:80`
- app interno Tarefa: `wimifarma-tarefa-app:3500`
- app interno XP: `wimifarma-xp-app:3600`
- app interno Codigos: `wimifarma-codigos-app:3700`
- app interno Calendario: `wimifarma-calendario-app:4105`
- app interno Financeiro oficial: `wimifarma-financeiro-app:3800`
- app interno Usuarios: `wimifarma-usuarios-app:3900`
- app interno Miauby sombra leitura: `wimifarma-miauby-app:4100`
- bind local do Compose: `127.0.0.1:3002`
- tunel local do PuTTY usado em testes: `127.0.0.1:13002`
- publico: `80/443` via Nginx Proxy Manager

Nao misturar essas portas ao configurar proxy, DNS ou WordPress.

## Documentacao

- `AGENTS.md`: manual obrigatorio para futuras conversas do Codex/agentes.
- `docs/00-visao-geral.md`: visao geral e mapa funcional.
- `docs/01-arquitetura.md`: arquitetura tecnica.
- `docs/02-banco-de-dados.md`: bancos, tabelas e cuidados.
- `docs/03-fluxos-do-sistema.md`: fluxos de usuario e operacao.
- `docs/04-padroes-de-codigo.md`: padroes existentes.
- `docs/05-comandos.md`: comandos locais, VPS, auditoria e Git.
- `docs/06-pendencias.md`: backlog tecnico encontrado.
- `docs/07-historico-de-decisoes.md`: decisoes tecnicas importantes.
- `docs/08-autenticacao-e-permissoes.md`: login, sessao, roles e riscos.
- `docs/09-deploy-e-ambiente.md`: VPS, DNS, proxy, portas e deploy.
- `docs/10-integracoes.md`: OpenAI, Farmacia Popular, GoDaddy, NPM e Google Sheets futuro.
- `docs/11-seguranca.md`: segredos, headers, CSRF, riscos e hardening.
- `docs/15-logs-e-auditoria.md`: logs, auditoria e diagnostico.
- `docs/16-testes.md`: validacoes atuais e evolucao de testes.
- `docs/17-performance.md`: performance, cache e cuidados WordPress.
- `docs/18-miauby-evolucao-generativa.md`: direcao para skills, padroes e autonomia segura do Miauby.
- `docs/19-cotacao-tempo-real.md`: presenca ao vivo, sync atual e caminho para colaboracao estilo Sheets.
- `docs/20-cotacao-v2.md`: arquitetura nova da Cotacao em Node.js, Postgres, Redis e WebSocket.
- `docs/21-miauby-whatsapp.md`: canal WhatsApp do Miauby, Evolution API, Meta Cloud API, painel, fila e seguranca.
- `docs/22-migracao-mysql-postgres.md`: inventario do uso restante de MySQL e plano gradual para migrar modulos internos para Postgres.
- `docs/23-n8n-automacoes.md`: plano de automacoes n8n sem virar backend de regras.
- `docs/24-modernizacao-modulos.md`: inventario dos modulos antigos e caminho para Node.js/TypeScript/Postgres.
- `docs/25-usuarios-permissoes.md`: modulo Usuarios, permissoes centrais, vinculo XP e caminho de enforcement.
- `docs/26-inventario-modulos.md`: ficha detalhada por modulo com rota, telas, permissoes, tabelas, escritas, integracoes e riscos.

Leia `AGENTS.md` antes de qualquer alteracao.
