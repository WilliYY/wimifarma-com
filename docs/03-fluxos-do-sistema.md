# 03 - Fluxos do sistema

## O que esta parte documenta

Este documento descreve os fluxos reais encontrados no sistema e os cuidados para evoluir cada um.

## Fluxo de acesso

Entrada publica:

- `/`: home/portal independente em `site/home.php`. Antes dos cards, a rota mostra um login inicial com sessao propria `WFHOME`, CSRF, credencial temporaria padrao `adm`/`adm`, logo animada, texto `Apenas funcionarios`, anel animado, card de video MP4 em loop com link para `https://wimifarma.com.br` ao lado do formulario em telas largas e compacto abaixo do formulario no mobile/tablet pequeno, e footer com bolhas que mudam de cor. Apos autenticar, mostra fundo visual em video em tela inteira preservando as cores originais sem overlay branco de clareamento, logo animada propria da home sem fundo, botao `Trocar usuario`, GIFs decorativos com movimento reaproveitado dos logins e cards inferiores de acesso aos modulos. Desde 2026-06-05, `Trocar usuario` abre uma lista de usuarios ativos e logaveis do core, sem o perfil institucional `role=farmacia`, pede somente a senha do usuario escolhido, renova a sessao `WFHOME`/`WFHOME_SSO`, limpa cookies dos modulos e limpa o estado frontend da Home/Miauby para evitar dados do operador anterior. Desde 2026-06-03, a Home autenticada tambem aciona falas curtas do widget Miauby perto do botao flutuante, usando nome exibido do core quando existir, primeiro nome quando ele for longo, controle em `sessionStorage` por usuario/sessao, balao visivel por 5 segundos e nova fala a cada 5 segundos, com pausa temporaria quando a pessoa interage com o widget. Essas falas ficam em categorias `greetings` e `jokes`; as piadas sao exclusivas de momentos leves da Home e nao sao usadas em comandos, erros ou alertas operacionais.
- Quem abrir diretamente uma rota protegida de modulo sem sessao do modulo nem `WFHOME_SSO` valido e redirecionado para `/`, para que a primeira tela seja sempre a home/login central. Rotas de health, badges publicos e endpoints internos tokenizados continuam fora desse redirecionamento.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe badge vermelho quando houver tarefas abertas.
- O card `Pedidos` abre `/pedidos/`, ao lado de `Cotacao`, com badge do total ainda em `Aguardando chegada`.
- O card `XP` abre `/xp/` e usa uma moldura visual propria, aplicada somente nesse card como `border-image` de borda/cantos para destacar a entrada sem cortar a arte nem cobrir o texto.
- O card `Usuarios` abre `/usuarios/` para administrar logins, modulos, vinculo XP e historico central.
- O card `Gestao` abre o modulo administrativo de contas a pagar manuais; os demais cards seguem na grade da home em desktop.
- A home usa no maximo cinco cards por linha no desktop e a ordem dos acessos e: `Cashback`, `Cotacao`, `Pedidos`, `Financeiro`, `Tarefas`, `Codigos`, `Calendario`, `XP`, `Gestao`, `Miauby`, `Miauby Whatsapp`, `Login / Senha` e `Usuarios`; `Usuarios` fica por ultimo quando todos estiverem visiveis. O card separado `Login / Senha ADM` foi removido da Home em 2026-06-05; a area restrita para logins/senhas especificos do sistema agora aparece como aba `Contas` dentro de `/login-senha/` somente para `adm`, `admin` ou `gerente`. Quando a home possui `WFHOME_SSO` valido ou o navegador possui sessao ativa no XP/Usuarios, o login esta vinculado a um funcionario XP e o modulo `xp` esta liberado, a home exibe no desktop um mini-card do XP a esquerda da grade, com foto, nivel, ranking, XP do mes, XP total e barra de progresso atualizados por endpoint dos apps Node. No mobile, os cards de acesso ficam em duas colunas compactas para reduzir rolagem e mostrar mais modulos na primeira tela.
- Desde 2026-06-03, os cards da Home autenticada usam textos mais curtos, CTA `Abrir` e acento visual por cor para melhorar leitura em desktop/mobile sem alterar links, ordem, SSO, troca de usuario ou permissoes. As etiquetas circulares internas dos cards foram removidas para voltar a uma leitura mais limpa; a barra/acento e a animacao de hover permanecem. Quando poucos cards ficam visiveis por permissao, a grade ajusta o numero de colunas para evitar linhas isoladas e excesso de espaco vertical.

Identidade visual validada em 2026-05-21:

- Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw carregam a logo nova nas telas de login e nas telas internas autenticadas.
- Nas telas internas dos modulos, clicar na logo/marca do topo deve voltar para a Home `/`, preservando os menus operacionais de cada modulo.
- Os SVGs ativos desses modulos batem com o mesmo hash da logo oficial nova; a home publica pode usar o GIF animado sem fundo como variacao visual sem alterar a identidade dos modulos internos.
- Desde 2026-06-08, a variacao animada da Home voltou a ser `logo-wimifarma-home-animated.gif`, o GIF original aprovado pelo usuario, sem recriar o movimento por SVG/keyframes; ela alimenta as logos do login, rodape e header autenticado, enquanto os SVGs oficiais continuam nos modulos internos.
- `/wp-login.php` e uma tela WordPress separada e continua podendo exibir o cabecalho/logo padrao do WordPress; isso nao e regressao dos modulos internos, salvo quando a tarefa pedir customizacao do login WordPress.

Rotas de login:

- `/` (login inicial da home, sessao `WFHOME`)
- `/cashback/login.php`, `/codigos/login.php`, `/cotacao/login.php`, `/financeiro/login.php`, `/usuarios/login.php`, `/gestao/login.php`, `/xp/login.php`, `/tarefa/login.php` e `/miauw/login.php` ficam como compatibilidade tecnica para SSO/sessoes existentes, mas um GET sem sessao valida redireciona para `/`.
- `/pedidos/`
- `/wp-login.php`

Os modulos PHP remanescentes reaproveitam helpers proprios do Miauby/WordPress quando necessario. Cashback, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro e Usuarios usam sessoes proprias nos seus servicos Node/Postgres; Cashback, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro e Cotacao nao possuem rollback MySQL de autenticacao no codigo atual. Cotacao V2 usa sessao propria em Redis.

Arquivos envolvidos:

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/*/bootstrap.php`
- `site/*/login.php`
- `site/*/logout.php`

## Fluxo Cashback

O Cashback cobre:

- cadastro e consulta de clientes;
- registro de compras;
- geracao de creditos;
- controle de validade;
- resgates;
- relatorios;
- mensagens/WhatsApp;
- logs e configuracoes.

Desde 2026-06-08, a tela `Mensagens` do Cashback usa cards de fila mais modernos e densos, com acento por campanha e metadados de criacao/data, preservando as mesmas regras de status, dedupe, CSRF, historico e expiracao da fila.

Desde 2026-06-08, `Configuracao e Relatorio` tambem usa uma apresentacao mais moderna e compacta para manutencao, atendentes, acessos, metricas e exportacoes, com status visual nos cards de equipe e acentos por bloco sem alterar formularios, CSRF, POSTs, exportacao, inativacao/exclusao logica ou auditoria.

Arquivos principais:

- `apps/cashback/src/server.ts`
- `site/cashback/styles.css`
- `site/cashback/app.js`
- `site/cashback/login-runner.js`
- `site/cashback/logo-wimifarma.svg`
- `site/cashback/gato-hapy.gif`
- `site/cashback/mario.gif`

Tabelas principais:

- Postgres `cashback_clients`
- Postgres `cashback_attendants`
- Postgres `cashback_purchases`
- Postgres `cashback_credits`
- Postgres `cashback_redemptions`
- Postgres `cashback_redemption_items`
- Postgres `cashback_settings`
- Postgres `cashback_whatsapp_messages`
- Postgres `cashback_audit_events`
- Postgres `cashback_sessions`
- MySQL `wf_*` do Cashback apenas como referencia historica/backup; o app atual nao possui importacao/espelho por flags

Regras importantes:

- a rota oficial `/cashback/` e servida por `apps/cashback` via proxy Apache;
- o frontend visual permanece o mesmo de `site/cashback`, montado como assets no container Node;
- dinheiro fica em centavos inteiros no Postgres, exportado em CSV como valor decimal;
- a relacao compra -> credito -> resgate deve continuar preservada com consumo FIFO dos creditos;
- o resgate roda em transacao Postgres e bloqueia creditos ativos do cliente para evitar saldo duplicado;
- `/cashback/health` mostra storage Postgres, auth core e contagens de migracao;
- `/cashback/autoteste.php` cria compra/credito/resgate em transacao e desfaz tudo com rollback;
- `atendentes.php` redireciona para `relatorio.php#atendentes`, como no legado.

## Fluxo Usuarios

O modulo Usuarios administra os logins internos em `/usuarios/`. Ele e servido por `apps/usuarios` em Node.js + TypeScript, usa sessao propria `WFUSUARIOS`, autentica no Postgres core `core_users` e fica restrito a username `adm` ou role `admin`.

A tela permite criar usuario com senha, perfil e status, desativar usuario sem apagar fisicamente, escolher quais modulos ficam liberados, associar o login a um funcionario do XP, vincular numeros da allowlist do Miauby WhatsApp e consultar o historico central de mudancas. No cadastro, o campo de usuario aceita nome com espaco/acento e o backend normaliza para login seguro antes de gravar no core, por exemplo `Joao Silva` vira `joao.silva`. O historico geral fica minimizado na lateral, e cada card de usuario possui historico individual minimizado por padrao, mostrando tanto o que aquele login fez quanto alteracoes feitas nele. A associacao com XP usa `core_user_xp_links` apontando logicamente para `xp_employees.id`; a fonte oficial de XP continua sendo o modulo XP. Os endpoints `/usuarios/api/me/xp-card` e `/xp/api/me/xp-card` retornam somente o mini-card XP do usuario autenticado naquele app ou autenticado pela home via `WFHOME_SSO`, desde que o modulo `xp` esteja permitido, consultando o vinculo no core e os totais diretamente no Postgres do XP.

O card de cada usuario tambem possui o bloco `Ferias`, gravando inicio e retorno em `core_user_vacations`. O status e calculado pelo fuso `America/Sao_Paulo`: sem ferias, ferias agendadas, em ferias ou retornou. Enquanto o usuario estiver em ferias, o Miauby Whats consulta o `linked_user_id` do contato antes de mensagens automaticas e bloqueia lembretes/tarefas/rotinas para esse usuario, registrando o motivo em `core_user_vacation_message_logs` e no historico central. Isso nao remove allowlist, nao bloqueia login e nao interfere em mensagens manuais.

O painel de Usuarios deve deixar claro que a fonte oficial e o Postgres core; quando um login veio de `wf_users`, a tela mostra isso como origem importada do MySQL em vez de expor o identificador tecnico cru.

O login de Usuarios usa o happy cat zanzando pela tela e fugindo do cursor como detalhe visual, sem interferir no formulario ou na sessao.

Tarefas privadas devem ser criadas e gerenciadas no modulo `/tarefa/`, que valida o usuario de destino e controla visibilidade. Numeros do WhatsApp vinculados pelo painel ficam com telefone completo apenas no bridge do Miauby WhatsApp; o core guarda somente `contact_id`, mascara, status e cards liberados.

Tabelas principais:

- `core_users`
- `core_user_module_permissions`
- `core_user_xp_links`
- `core_user_whatsapp_links`
- `core_user_vacations`
- `core_user_vacation_events`
- `core_user_vacation_message_logs`
- `core_user_audit_events`
- `usuarios_sessions`

Regras importantes:

- `Excluir` no painel preenche `core_users.active=false`, preservando auditoria.
- O usuario `adm` nao pode ser desativado pelo painel.
- Deve existir pelo menos um administrador ativo.
- Linhas ausentes em `core_user_module_permissions` preservam acesso legado; usuarios criados pelo painel ja recebem permissoes explicitas.
- Um usuario pode ter mais de um numero WhatsApp vinculado, mas cada contato deve ter um unico dono operacional.
- Remover WhatsApp pelo painel Usuarios bloqueia o contato na allowlist do bridge para impedir disparo individual indevido.

## Fluxo Codigos

O modulo Codigos guarda atalhos operacionais para itens com comissao diferente. A rota oficial `/codigos/` e servida por `apps/codigos` em Node.js + TypeScript com Postgres dedicado, preservando o mesmo frontend visual pelos assets de `site/codigos`. O PHP antigo fica arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`. A tela principal funciona como planilha simples, com campos sempre editaveis para `Codigo`, `EAN` e `Preco`, salvando automaticamente as mudancas.

Para evitar confusao operacional, a tela separa os itens em blocos por prefixo de EAN, mantendo `EAN 20` e `EAN 40` como blocos padrao. O botao `+` cria um novo bloco pelo backend em `codigos_groups` apenas quando o usuario informa manualmente o prefixo desejado, permitindo que o bloco continue existindo mesmo antes do primeiro item. Cada tabela possui uma linha nova no rodape; quando os tres campos estao preenchidos, o item e criado automaticamente no grupo correspondente. A tela usa faixa horizontal interna para criar tabelas lado a lado e aproveitar melhor as laterais do monitor, sem criar rolagem horizontal vazia no documento inteiro.

O login de Codigos segue o padrao visual vinho/rosa dos outros logins internos, mas o fluxo novo usa sessao `WFCODIGOS`, CSRF e somente `core_users` desde 2026-05-30. Rollback MySQL exige restaurar versao anterior e backup validado.

Arquivos principais:

- `apps/codigos/src/server.ts`
- `site/codigos/styles.css`
- `site/codigos/app.js`
- `site/codigos/login-runner.js`

Tabelas principais:

- Postgres `codigos_items`
- Postgres `codigos_groups`
- Postgres `codigos_audit_events`
- Postgres `codigos_sessions`
- MySQL `wf_codigos_comissao` e `wf_codigos_blocos` apenas como referencia historica/backup

Regras a preservar:

- codigo, EAN e preco devem ser editaveis sem fluxo complexo;
- edicoes devem salvar automaticamente por `/codigos/api.php`, mantendo sessao e CSRF;
- a coluna `Codigo` deve mostrar a frase inteira visualmente, quebrando linha e aumentando a altura da linha/tabela quando o texto for longo;
- editar uma linha nao deve mover sua posicao, salvo quando o EAN mudar para outro prefixo visual;
- reordenar deve ser feito arrastando o numero da linha dentro do mesmo grupo, persistindo `ordem`;
- novos itens entram no fim do grupo visual de EAN correspondente;
- EANs com prefixos diferentes devem ficar em tabelas separadas na tela; `20` e `40` aparecem por padrao, e outros prefixos devem ser criados pelo botao `+` via `/codigos/api.php` usando o numero informado pelo usuario, sem sequencia automatica;
- apagar pela tela deve fazer exclusao logica (`ativo=0`) para reduzir risco de perda acidental;
- apagar uma tabela inteira so e permitido para blocos numericos nao padrao, exige card de confirmacao, CSRF, sessao ativa e senha operacional `wimifarma`, com suporte a override por `CODIGOS_GROUP_DELETE_PASSWORD`;
- acoes de criar, editar, reordenar e apagar registram `codigos_audit_events` e `core_audit_logs`, sem espelho em `wf_logs`.

## Fluxo Calendario

O modulo Calendario abre em `/calendario/` e usa as imagens mensais geradas de `Calendario.pdf` como base visual. O cabecalho introdutorio e compacto para manter o foco na arte do calendario; a barra superior agrupa as setas ao redor do mes/ano e deixa as acoes operacionais alinhadas a direita no desktop, quebrando em blocos centralizados no mobile. A arte ja contem o ano `2026` e os numeros dos dias; por isso o frontend nao redesenha esses textos e usa a propria imagem como referencia para posicionar as areas editaveis. Clicar no quadrado permite escrever no proprio dia e abre o painel lateral com o texto completo; desde 2026-06-08, esse painel fica ajustado ao conteudo, com cabecalho/anotacao/resumo em blocos compactos e swatches circulares para cor, mantendo a arte como foco. Texto longo sem espaco quebra para baixo no painel e no resumo, sem criar rolagem horizontal. Deixar o mouse parado sobre um dia com anotacao mostra um tooltip com o texto completo, e clicar com o botao direito abre uma paleta flutuante para pintar ou limpar a cor do dia sem sair do quadrado. A anotacao aparece como escrita dentro da area util do quadrado impresso, sem corretor visual, e a cor escolhida pinta somente a parte interna do dia como camada translucida em lavagem suave tipo marcador para preservar os riscos pretos do PNG. A imagem mensal tambem pode ser segurada e arrastada horizontalmente com cursor de pegar/segurar, deslocando a arte e a camada editavel juntas para trocar de mes com animacao lateral de saida/entrada; quando o navegador pede movimento reduzido, a troca fica direta. A paleta inferior aparece como faixa visual de swatches sem textos visiveis; os nomes das cores continuam salvos e usados em acessibilidade/titulos, e a cor aplicada ao dia fica em `calendario_day_notes`.

Para 2027, o usuario pretende usar outro modelo/PDF de calendario vindo do Canva. Essa troca deve ser tratada como mudanca visual: substituir a arte mensal, recalibrar areas editaveis/alinhamento conforme os novos quadrados impressos e preservar as mesmas features ja validadas em 2026, incluindo escrita no quadrado, pintura, paleta, tooltip, botao direito, arraste lateral, autosave, revisoes, permissoes e resumo seguro do Miauby.

O autosave grava texto/cor no Postgres pelo app Node `apps/calendario`, com sessao `WFCALENDARIO`, CSRF, permissao `core_user_module_permissions.module_key='calendario'`, auditoria local/core e revisoes em `calendario_day_note_revisions`. Cada salvamento de dia usa timer proprio no frontend, transacao e lock por dia; se a aba estiver com `updated_at` antigo e outro usuario/aba ja tiver alterado o mesmo dia, o backend responde conflito e nao sobrescreve silenciosamente a versao mais nova. Trocar de ano ou criar o proximo calendario tenta salvar pendencias antes de carregar outro calendario. Arquivar uma cor tambem cria revisoes dos dias afetados antes de limpar o vinculo. O botao `Criar proximo calendario` cria o proximo ano, reutiliza a paleta e deixa as anotacoes/marcacoes vazias. O endpoint interno `/calendario/api/internal/summary` ensina o Miauby sobre o modulo sem retornar o texto completo das notas; ele expoe finalidade, referencia do PDF, recursos atuais, regras de privacidade, contagens por mes, cores e atualizacoes recentes para a tool de leitura `resumo_calendario`.

## Fluxo XP

O modulo XP gamifica vendas dos atendentes. A tela principal fica como mapa de jogo com a trilha XP horizontal em zigue-zague, sem barra de rolagem visivel dentro da fase; o usuario pode segurar e puxar o mapa com o mouse para navegar lateralmente. O perfil ADM tambem aparece como jogador visual com nome `ADM` no nivel 1. A trilha mostra os niveis 1 a 20 enquanto a equipe estiver no inicio e, depois disso, usa uma janela curta ao redor do nivel mais alto para continuar dando sensacao de progressao infinita sem renderizar niveis demais. A escala visual da trilha no desktop deve ficar mais afastada, com pegadas em tamanho natural repetidas e recortadas entre cada nivel; o frontend mede a posicao dos blocos e ancora cada segmento de pegadas entre o bloco anterior e o proximo para reforcar a leitura de caminho. A aba `Configuracoes` concentra cadastro de funcionarios, upload de fotos, filtro de mes, resumo por XP, edicao, exclusao logica de usuarios/funcionarios e lancamentos diarios. A equipe cadastra funcionarios, sobe uma foto e lanca os valores do dia; o backend calcula automaticamente os pontos.

Arquivos principais:

- `apps/xp/src/server.ts`
- `site/xp/styles.css`
- `site/xp/app.js`
- `site/xp/login-runner.js`
- `site/xp/assets/`
- `site/xp/uploads/funcionarios/`
- `site/xp/uploads/adm/`
- `site/_legacy-disabled/2026-05-29/xp-php/` (PHP antigo arquivado)

Tabelas principais:

- Postgres `xp_employees`
- Postgres `xp_sales`
- Postgres `xp_settings`
- Postgres `core_users` para login
- Postgres `xp_audit_events` para auditoria

Regras a preservar:

- qualquer usuario interno autenticado pode visualizar a trilha XP;
- alimentar dados exige username `adm` ou role `admin`/`gerente`;
- o login do XP deve manter a logo oficial, o titulo `Entrar no XP`, a descricao e o formulario, sem o selo textual amarelo `Wimifarma XP`;
- a navegacao do XP separa `Trilha` de `Configuracoes`; formularios e historico operacional ficam fora da tela principal da fase para evitar poluicao visual;
- a Trilha exibe jogadores em avatares compactos nos niveis e em uma faixa resumida, sem acoes de editar/excluir; clicar em um jogador abre apenas o resumo de XP;
- a aba `Configuracoes` prioriza leitura de XP e nao exibe cards de total de venda; valores monetarios ficam como entrada operacional para gerar XP;
- os cards de funcionarios em `Configuracoes` e a faixa inferior de jogadores na `Trilha` devem exibir barra amarela preenchida conforme o percentual real para o proximo nivel;
- em `Ultimos lancamentos`, a observacao opcional salva em `xp_sales.note` deve aparecer no lancamento, e o XP do lancamento deve ser destacado por uma barra amarela compacta;
- formularios usam CSRF e prepared statements;
- fotos aceitam apenas JPG, PNG ou WEBP, ate 3 MB, com dimensoes entre 80x80 e 6000x6000 px;
- a moldura ADM e usada no perfil/admin do XP, com foto propria salva separada dos funcionarios; o ADM aparece como perfil protegido, pode ter nome/foto editados, pode receber XP e nao pode ser excluido pela tela;
- as molduras visiveis dos avatares do XP devem usar assets com transparencia real, sem canvas branco ao redor da arte;
- as pastas `site/xp/uploads/funcionarios/` e `site/xp/uploads/adm/` precisam existir e ficar gravaveis pelo app XP no VPS;
- a pasta de uploads bloqueia listagem e execucao de scripts por `.htaccess`;
- R$ 1.000,00 em vendas gera 2.500 XP, gravado como inteiro no lancamento;
- o nivel 1 exige 30.000 XP para passar; os niveis seguintes ficam progressivamente mais dificeis e nao possuem limite fixo;
- a trilha usa `Bloco XP` nos niveis comuns, `Nivel 5` a cada multiplo de 5 e `nivel 10` a cada multiplo de 10;
- cancelar venda ou excluir/remover usuario/funcionario deve ser logico, sem apagar historico fisico; o botao `Excluir usuario` tira o atendente da lista e da trilha, preservando os lancamentos antigos.
- o Miauby conhece o XP e pode usar "farmar aura no XP" como incentivo de jogo para vendas reais e lancamentos corretos, mas nao pode inventar ranking, pontuacao, foto, funcionario ou nivel sem dado vindo do sistema ou do usuario.

## Fluxo Cotacao

O modulo de Cotacao V2 controla uma planilha interna de farmacia com EAN, produto, quantidade, categoria, distribuidoras e ganhador calculado. A rota `/cotacao/` e servida por Node.js/Express/Socket.IO via proxy do Apache, com dados em Postgres e presenca/sessao em Redis.

A colaboracao ao vivo acontece por WebSocket: a tela mostra usuarios ativos, foco remoto de celula e atualizacoes por celula. Filtros de busca/categoria ficam locais por tela para evitar que um computador mova a visao do outro.

Arquivos principais:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`

Tabelas principais:

- Postgres `cotacao_v2_quotes`
- Postgres `cotacao_v2_columns`
- Postgres `cotacao_v2_rows`
- Postgres `cotacao_v2_events`
- Postgres `cotacao_v2_rules`
- Postgres `core_users` para login

Regras a preservar:

- ordem/posicao das linhas;
- categoria/fornecedor;
- observacoes;
- cores, estilos e formatacao;
- auditoria;
- status.
- presenca temporaria nao deve virar historico operacional permanente.
- filtros nao devem ser sincronizados automaticamente entre computadores.
- durante digitacao em categoria, texto nao pode virar comando escondido nem alterar ordem.
- `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum; destaque visual so por regra condicional explicita.
- colagem, alca de preenchimento e desfazer/refazer de lotes devem usar batch otimista e atualizar apenas linhas afetadas quando nao houver mudanca estrutural.
- A Cotacao PHP antiga foi removida; nao existe fluxo paralelo em `site/cotacao`.
- O Miauby deve consultar e criar encomendas na Cotacao pela ponte interna tokenizada da V2 (`/cotacao/api/internal/search` e `/cotacao/api/internal/encomendas`), nao por tabelas legadas da Cotacao PHP.

## Fluxo Financeiro

O Financeiro organiza fechamento diario e conciliacao interna.

Arquivos principais:

- `apps/financeiro/src/server.ts`
- `site/financeiro/app.js`
- `site/financeiro/styles.css`
- `site/financeiro/login-runner.js`
- `site/financeiro` como legado/assets visuais.

Tabelas principais:

- `financeiro_closings`
- `financeiro_entries`
- `financeiro_sangrias`
- `financeiro_card_entries`
- `financeiro_pix_entries`
- `financeiro_settings`
- `financeiro_audit_events`
- `financeiro_internal_idempotency`
- MySQL `financeiro_*` apenas como referencia historica/backup; desde 2026-05-30 nao ha importacao, espelho ou fallback MySQL no runtime do Financeiro.

Regras a preservar:

- status de fechamento;
- totais conferidos;
- divergencias/sobra/falta;
- justificativas;
- auditoria interna.
- Caixa e Relatorio usam a mesma linha em `financeiro_closings` para cada dia. O botao `Fechar sem movimento` do Relatorio e apenas um atalho para marcar `status='sem_movimento'`, igual ao Caixa, e nao deve travar a digitacao posterior de venda/faturamento. Desde 2026-06-02, o backend bloqueia essa marcacao quando ja existe lancamento ativo ou valor/faturamento salvo no dia; o operador precisa remover/zerar o movimento antes de marcar sem movimento. Se depois for informado faturamento positivo em um dia sem movimento, o dia volta para `conferencia` e fica editavel no Caixa.
- O Caixa salva automaticamente campos do fechamento com debounce curto e o Relatorio salva faturamento diario por campo; quando existe autosave pendente ou em andamento, o navegador mostra aviso nativo ao tentar fechar/recarregar a aba.
- O endpoint interno `GET /financeiro/api/internal/cash-closing-status` informa ao Miauby/n8n se o caixa do dia esta fechado e devolve `open_days`/`open_days_count` com os dias em `aberto` ou `conferencia` apenas na janela dos ultimos 10 dias ate a data consultada; se o dia consultado nao tiver registro, ele entra como aberto implicito para o lembrete. Para alerta das 18h, `fechado`, `divergente` e `sem_movimento` so bloqueiam WhatsApp quando nao existe nenhum dia pendente nessa janela. Quando houver caixa aberto, o Miauby avisa contatos com card `Financeiro` em bloco formatado, com o dia consultado destacado e um caixa por linha; quando estiver tudo fechado, `notify=always` envia confirmacao curta de tudo certo.

Interface:

- o topo do Financeiro mostra apenas `Caixa`, `Relatorio` e `Sair`;
- a view dedicada de Auditoria nao fica disponivel na navegacao operacional;
- os registros em `financeiro_audit_events` continuam sendo gravados no Postgres para suporte e rastreabilidade; `financeiro_auditoria` no MySQL fica apenas como historico/backup.
- Desde 2026-06-05, o Caixa exibe um resumo visual por categoria do dia e cards de lancamento com categoria, valor, horario e observacao separados; essa camada usa os mesmos lancamentos ativos ja carregados e nao muda autosave, calculo, remocao, fechamento nem endpoints internos.
- O Miauby WhatsApp pode preparar lancamento `Pix CNPJ` a partir de foto, print, imagem encaminhada ou PDF/documento de comprovante Pix quando a flag de OCR estiver ligada. O bridge valida remetente, card `Financeiro`, destino por CNPJ/chave Pix ou nome correlato, valor e pagador; data e horario sao usados quando a leitura trouxer. Depois envia confirmacao `Sim`/`Nao`. Somente o `Sim` grava no Financeiro Node por endpoint interno tokenizado, com categoria `Pix CNPJ` e observacao sanitizada. Se a leitura da midia falhar ou ficar incompleta, o WhatsApp responde curto pedindo `miauby pix cnpj 28,90 sueli`; esse comando manual tambem e parseado localmente, aceita valor antes/depois do responsavel, `R$`, `28.90`, `28 reais`, typo `cpnj` e observacao, e grava pelo mesmo endpoint interno com `source=miauby_whatsapp`, `actor_user_id` e idempotencia `whatsapp:pix-cnpj:{trace_id}`. A resposta publica do WhatsApp deve ficar curta, no padrao `PIX CNPJ lancado: valor - responsavel`, enquanto destino, pagador completo, instituicao, ID Pix, texto original e observacao completa ficam apenas nos registros internos. `Nao`, destino divergente, dado faltante ou permissao ausente nao gravam nada e pedem texto corrigido.
- O Financeiro Node/Postgres atende `/financeiro/`, preserva o frontend visual, expoe health/resumo/checksums internos e roda sem `mysql2`, importador, espelho ou fallback MySQL desde 2026-05-30.

## Fluxo Gestao

A Gestao organiza contas a pagar manuais em um servico Node.js + TypeScript com Postgres dedicado. A conta principal guarda titulo, categoria livre, competencia, status e total em centavos; os itens internos guardam a composicao do valor, permitindo lancamentos como salario, aumento, comissao, boleto e juros na mesma conta. Pagamentos ficam separados e datados para permitir pagar em partes ate quitar o saldo, inclusive vinculados a um lancamento especifico quando o operador quer pagar item por item. Desde 2026-06-01, a visao mensal puxa contas pendentes de competencias anteriores para o mes selecionado ate serem pagas/canceladas, preservando a competencia original da conta; pagamentos datados no mes entram no total pago do mes.

Arquivos principais:

- `apps/gestao/src/server.ts`
- `apps/gestao/public/styles.css`
- `apps/gestao/public/app.js`
- `apps/gestao/public/login-runner.js`
- `site/_legacy-disabled/2026-05-29/gestao/` (legado PHP arquivado; rota oficial passa pelo proxy Apache para o Node)

Tabelas principais:

- Postgres `gestao_accounts`
- Postgres `gestao_account_items`
- Postgres `gestao_account_payments`
- Postgres `gestao_audit_events`
- Postgres `gestao_sessions`
- Postgres `gestao_notepad_notes`
- Postgres `gestao_supplier_orders` (legado; Pedidos novo usa tabelas proprias)
- Postgres `pedidos_orders`
- Postgres `pedidos_confirmed_orders`
- Postgres `pedidos_internal_idempotency`
- `core_audit_logs` para auditoria curta do login/acoes de Pedidos

Regras a preservar:

- acesso restrito a usuario `adm`, role `admin` ou role `gerente`;
- formularios usam sessao `WFGESTAO` em Postgres e CSRF;
- `generated_at` e automatico na criacao da conta;
- `total_cents` e calculado pelos itens, nao digitado como fonte separada;
- a categoria e texto livre, com sugestoes apenas para acelerar digitacao;
- categorias iguais por escrita diferente sao agrupadas visualmente por normalizacao de acento/caixa/espaco, preservando o texto original salvo; o painel lateral mostra bolinhas com abertas em verde e fechadas em vermelho, e clicar em uma categoria filtra as abertas primeiro e depois as fechadas daquela categoria;
- o painel de categorias permite trocar a categoria de um grupo inteiro ou cancelar somente contas abertas daquele grupo, sem apagar contas fechadas nem historico;
- a lista principal sem filtro mostra contas abertas do mes e pendencias trazidas de competencias anteriores em linhas compactas com `Categoria`, `Nome`, `Valor`, `Pagar` e `Abrir`; contas pagas/canceladas ficam acessiveis pela busca ou pelo filtro de categorias para evitar lista infinita de historico;
- contas ligadas a Pedidos por `gestao_supplier_orders`, `pedidos_orders` ou `pedidos_confirmed_orders` saem da lista geral e aparecem no bloco visual `Pedidos` perto do painel `Mensal`, preservando categoria `Boleto`, pagamentos, totais, status, busca/filtro e auditoria;
- o painel `Mensal` fica ao lado da lista principal e mostra as contas da competencia atual com `Repetir mes que vem` ativo em estrutura compacta propria para evitar sobreposicao entre valor e botoes; ele soma o valor que sera levado para a proxima competencia, permite abrir o extrato completo e salva a ordem manual quando o operador arrasta as linhas com o mouse;
- a busca fica abaixo dos resumos do mes e pesquisa contas/boletos por titulo, categoria, status, valor aproximado, saldo, vencimento, data de lancamento, data de pagamento, lancamentos e pagamentos; ela mostra 10 resultados primeiro, permite `Mostrar mais` e `Limpar`;
- a conta pode ter vencimento opcional por data, sem campo de horario na interface; contas pendentes com vencimento mais proximo sobem na lista e recebem aviso visual de vencido, vence hoje ou vence em poucos dias;
- cada conta aparece como extrato proprio: lancamentos/juros ficam juntos, pagamentos parciais ficam no historico da mesma conta, e saldo/progresso sao calculados sem misturar contas;
- pagamento parcial grava linha em `gestao_account_payments` com valor e data, abatendo o saldo da conta sem mexer nos itens lancados;
- quando o pagamento parcial e feito dentro de qualquer lancamento aberto, `gestao_account_payments.item_id` liga o pagamento ao item e o backend limita o valor ao menor saldo entre item e conta;
- confirmar restante registra um pagamento final apenas do saldo aberto, muda status para `pago`, grava `gestao_accounts.paid_at` e passa a somar no total mensal pago pelo pagamento;
- adicionar item depois do lancamento, como juros ou diferenca, aumenta o total e pode voltar uma conta paga para `pendente` se houver saldo;
- cancelar ou voltar para pendente nao apaga fisicamente a conta, seus itens nem seus pagamentos;
- contas pagas podem ser reabertas para ajuste e faturas podem ser canceladas sem exclusao fisica; pagamentos cancelados deixam de contar no total pago do mes;
- contas canceladas podem ser excluidas da tela individualmente ou por categoria filtrada; isso e arquivamento logico em `archived_at`/`archived_by`, nao delete fisico, e deixa a auditoria preservada;
- lancamentos e pagamentos individuais podem ser cancelados por status, mantendo historico visivel no extrato; lancamento cancelado pode ser reaberto, mas pagamentos que ja foram cancelados continuam apenas como historico ate o operador registrar novo pagamento;
- a conta pode ser renomeada depois de lancada para reaproveitar valor/composicao em outro nome sem mexer no historico financeiro;
- `Repetir mes que vem` funciona como ciclo liga/desliga de uma competencia: quando ativo, garante uma copia pendente na competencia seguinte, copiando categoria, observacao, vencimento avancado e itens ativos, mas sem copiar pagamentos, cancelamentos nem status pago; desligar o ciclo nao apaga copia ja criada para evitar perda acidental;
- `Repetir sempre mes que vem` marca a conta como recorrencia permanente (`repeat_forever`): ela fica priorizada no topo do painel `Mensal`, continua visivel mesmo depois de paga e, ao quitar a conta, o backend garante idempotentemente a copia do proximo mes com a mesma regra permanente, sem duplicar pagamentos nem copiar o status pago;
- a observacao da conta pode ser editada depois do lancamento e fica minimizada por padrao ate o operador abrir;
- os cards de conta ficam compactos por padrao e podem ser abertos individualmente pelo botao `Abrir`, mantendo a lista fina para caber mais contas por tela; dentro da conta, vencimento, pagamentos, observacao, historico e ajustes/pagamento tambem ficam em blocos recolhidos para reduzir poluicao visual;
- lancamentos pagos, lancamentos cancelados, pagamentos cancelados e eventos de auditoria aparecem no bloco `Historico`, fechado por padrao, em vez de poluir a area principal da conta;
- o bloco de notas lateral permite criar, editar e apagar lembretes administrativos por exclusao logica;
- acoes de login, criacao, adicao de item, pagamento e mudanca de status registram `gestao_audit_events` e/ou `core_audit_logs`; Gestao e Pedidos nao espelham mais em `wf_logs`.
- o Miauby pode abrir a Gestao com o comando `gestao`/`abrir gestao` e preparar uma conta com ordens flexiveis como `gestao - titulo - valor - categoria`, `gestao - valor - titulo`, `gestao titulo valor` ou categoria antes/depois; se houver so nome + valor, a categoria vira `geral`, se faltar nome ou valor ele pergunta, e a gravacao so acontece depois de confirmacao humana pelo chat.

Modulo `Pedidos` em `/pedidos/`:

- o formulario `Pedidos feitos` registra fornecedor, uma ou mais parcelas com valor e vencimento proprio opcional apenas por data, previsao opcional de chegada como numero de dias, competencia, observacao e opcoes curtas `Pago, falta chegar`, `Chegou, falta pagar` e `Chegou e pago - Registrar`;
- esse formulario deve ficar visualmente separado em blocos de fornecedor, parcelas, entrega, status inicial e observacao, mantendo o total no cabecalho e preservando nomes de campos, CSRF e validacoes existentes;
- a previsao de chegada de novo pedido e digitada como numero de dias, nao como data manual: `2` significa dois dias a partir do dia atual local, e o sistema grava a data calculada em `pedidos_orders.expected_arrival_at`;
- criar um pedido tambem cria uma conta vinculada em `gestao_accounts` com categoria `Boleto`; cada valor/parcela vira item em `gestao_account_items` com `due_at` proprio quando preenchido, e a menor data ativa alimenta `gestao_accounts.due_at` para ordenacao e resumo;
- o fluxo operacional fica separado da Gestao: `pedidos_orders` guarda pedidos feitos/aguardando chegada, e `pedidos_confirmed_orders` guarda confirmados e historico;
- contas vinculadas a pedidos ficam travadas na categoria `Boleto`; recategorizacao em lote e bloqueada quando a categoria contem pedidos para preservar o controle financeiro automatico;
- se o pedido ja foi pago na criacao, o pagamento entra imediatamente em `gestao_account_payments`, mas o pedido continua em `pedido` ate a chegada ser confirmada;
- pedidos ainda em `Aguardando chegada` podem ser marcados como `Ja foi pago, so falta chegar`; essa acao grava somente o saldo aberto em `gestao_account_payments`, atualiza a conta para `pago` quando quitar e nao confirma chegada automaticamente;
- se o pedido ja chegou na criacao, ele nasce em `Confirmados` para aguardar pagamento; se tambem ja estiver pago, ou se o operador escolher `Chegou e pago - Registrar`, nasce recebido e quitado em `Historico`, com um unico pagamento total em `gestao_account_payments`, sem pendencia de chegada ou cobranca;
- ao clicar em `Confirmar chegada`, o pedido vai para `Confirmados` quando ainda existe saldo ou direto para `Historico` quando ja estava quitado;
- `Confirmados` ordena os boletos pela menor data de vencimento ativa das parcelas primeiro e mostra alertas de vencido/urgente/atencao conforme a proximidade;
- pagamentos parciais, botao `Pago` e ajustes de juros/diferenca reutilizam `gestao_account_payments` e `gestao_account_items`, alimentando automaticamente o total mensal e a categoria `Boleto`; a data de pagamento parcial e informada apenas por data na interface;
- quando o pedido esta recebido e quitado, ele vai para `Historico` com datas de criacao, confirmacao, pagamento e finalizacao preservadas;
- cards em `Aguardando chegada`, `Confirmados` e `Historico` ficam minimizados por padrao e podem ser abertos ao clicar no resumo do proprio card, sem botao extra de `+/-`; no modo reduzido, os cards ativos mostram status compacto, saldo e acao principal (`Confirmar` para chegada ou `Pago`), enquanto o icone de lapis abre a edicao de fornecedor/valores/vencimentos ativos com auditoria em `gestao_audit_events` e `core_audit_logs`; o visual minimizado deve ser denso, com padding/chips/icones menores e botao principal curto alinhado a direita, sem virar barra larga;
- desde 2026-06-06, a tela de Pedidos tambem usa indicadores superiores com acentos por estado, formulario de novo pedido destacado, colunas operacionais com cabecalho colorido/sticky no desktop, cards com acento por status e microanimacoes CSS leves; isso e apenas camada visual e nao altera formularios, POSTs, CSRF, pagamentos, chegada, arquivamento logico, auditoria, banco ou endpoints internos;
- no painel do lapis de `Aguardando chegada` e `Confirmados`, o operador pode alterar fornecedor, editar cada parcela ativa, retirar parcelas por cancelamento logico quando nao houver pagamento vinculado e adicionar nova parcela com valor, vencimento opcional e nome opcional; a nova parcela usa `gestao_account_items`, recalcula total/vencimento/status e preserva auditoria;
- os cards-resumo do topo de Pedidos tambem devem usar altura compacta para ampliar a area visivel das colunas operacionais; `Boletos em aberto` continua sendo quantidade, `Valor para chegar` soma o saldo ainda nao pago dos pedidos aguardando chegada e `Valor boletos abertos` soma o saldo ainda nao pago dos boletos confirmados em aberto, sem duplicar valor em tabela paralela;
- em zoom alto ou viewport intermediario, Pedidos deve reorganizar a grade operacional para duas colunas antes de cair no mobile, evitando corte horizontal, sobreposicao de valores/botoes e quebra dos cards compactos;
- esses mesmos cards mostram icone de excluir para retirar da tela quando nao houver necessidade de registrar o boleto;
- remover valores ou excluir um pedido da tela nao apaga dados financeiros: valores viram `cancelado` quando permitido, e pedidos inteiros usam arquivamento logico em `gestao_accounts.archived_at`/`archived_by` mais lifecycle/cancelamento nas tabelas de Pedidos;
- a tela `/pedidos/` carrega o widget do Miauby como apoio operacional, sem transformar Pedidos em subview da Gestao;
- endpoints internos tokenizados de Pedidos permitem a rotina n8n/Miauby: `GET /pedidos/api/internal/arrival-summary` lista `Aguardando chegada` com o valor total de cada pedido, `POST /pedidos/api/internal/confirm-arrival` confirma chegada por `order_id` ou titulo de fornecedor, e `POST /pedidos/api/internal/create-order` cria pedido a partir do Miauby Whats usando o mesmo fluxo da tela, com `actor_user_id`, card `Pedidos`, auditoria e idempotencia em `pedidos_internal_idempotency`; respostas WhatsApp como `cimed chegou` exigem card `Pedidos`, registram auditoria e nao marcam pagamento;
- no WhatsApp, comandos no formato `miauby pedido fornecedor valor` criam pedido diretamente sem Gemini. Exemplos seguros: `miauby pedido anb 350`, `miauby pedido 350 anb`, `miauby pedido anb 350 chegada amanha`, `miauby pedido anb 350 ja pago so chegar`, `miauby pedido anb 350 ja chegou so pagar`, `miauby pedido anb 350 pago e recebido` e `miauby pedido anb 350 chegou e pago registrar`. Parcelas podem ser informadas como `miauby pedido anb em 2 parcelas 200 10/06 e 150 20/06`; com um unico valor, `350 em 2x` e total dividido, e `2 parcelas 175`/`2 boletos 175` e valor por parcela. Se faltar fornecedor/valor, houver data passada ou status contraditorio, o bridge responde curto e nao grava; se a soma das parcelas divergir do total informado, cria uma pendencia `SIM/NAO` vinculada ao ultimo comando daquele numero;
- no WhatsApp, perguntas como `miauby em pedidos o que falta chegar` devem retornar localmente a mesma tabela de pedidos aguardando chegada, sem rodar resposta generativa e sem mostrar instrucao extra no rodape da mensagem automatica;
- o badge da home consulta `/pedidos/api/badge` e mostra quantos pedidos em `pedidos_orders` ainda estao em `Aguardando chegada`;
- a URL antiga `/gestao/pedidos` redireciona para `/pedidos/` apenas por compatibilidade e nao deve receber novas features.

## Fluxo Tarefas

Modulo simples de tarefas internas, servido por `apps/tarefa` em Node.js + TypeScript com Postgres dedicado.

Arquivos:

- `apps/tarefa/src/server.ts`
- `apps/tarefa/public/app.js`
- `apps/tarefa/public/styles.css`
- `site/tarefa/` como legado de referencia/fonte visual, com PHP direto bloqueado por `.htaccess`

Tabelas:

- Postgres `tarefa_tasks`
- Postgres `tarefa_audit_events`
- Postgres `tarefa_sessions`
- MySQL `wf_tarefas` como importacao/espelho temporario de rollback

Estados conhecidos:

- `aberta`
- `concluida`
- `cancelada`

Prioridades conhecidas:

- `alta`
- `normal`
- `baixa`

Regras:

- `/tarefa/badge.php` retorna apenas a contagem de tarefas publicas abertas, para a home nao vazar volume de tarefas privadas;
- criar, editar, concluir, cancelar e reabrir usam CSRF e sessao `WFTAREFA`;
- tarefas com `assigned_core_user_id` aparecem somente para o usuario indicado e nao entram no espelho MySQL legado;
- endpoint interno de tarefa privada tambem revalida no app Tarefa se o usuario de destino esta ativo e pode receber tarefa, mesmo quando a chamada veio de Miauby/WhatsApp ou de outro fluxo interno tokenizado;
- ao mudar o dono de uma tarefa, lembretes Miauby agendados sao cancelados/recriados para impedir envio ao usuario anterior;
- o formulario de criacao pode separar visualmente `Dia` e `Horario` do lembrete Miauby, mas deve continuar gravando o mesmo `remind_at`; o card precisa manter largura/respiro ou quebra responsiva para esses campos nao se sobreporem;
- desde 2026-06-06, a tela `/tarefa/` separa melhor visualmente criacao, fila aberta, badges de prioridade/Miauby Whats e historico recolhido por CSS, sem alterar escrita, status, filtros de visibilidade, CSRF, endpoints internos ou envio WhatsApp;
- a tela visual deve continuar equivalente ao modulo antigo durante a migracao;
- Desde 2026-05-30, Tarefa nao possui `mysql2`, importador, espelho ou fallback `wf_users`; rollback MySQL exige restaurar versao anterior e backup validado, sem mudar a fonte oficial de verdade do Postgres.

## Fluxo Miauby

Miauby e o assistente interno. Ele guarda conversas, memorias, conhecimentos, alertas, padroes e rotinas de Farmacia Popular.

A navegacao superior do Miauby deve ficar focada no proprio modulo: Chat, Treino, Diagnostico e Sair conforme a tela/permissao. Nao recolocar atalhos diretos para Cashback, Cotacao ou Financeiro nesse topo sem pedido explicito.

A imagem-fonte atual do Miauby e `site/miauw/miauby-novo.jpeg`; o avatar de interface preferencial e o derivado quadrado `site/miauw/miauby-avatar.jpeg`, usado no chat interno, widget global e login do painel WhatsApp para preencher melhor as molduras sem deixar miniatura pequena demais. No widget global, o ajuste visual fica centralizado em `site/miauw/widget.css` e usa cache-bust dos includes dos modulos para evitar CSS antigo.

Arquivos principais:

- `site/miauw/index.php`
- `site/miauw/diagnostico.php`
- `site/miauw/treino.php`
- `site/miauw/api.php`
- `site/miauw/widget-status.php`
- `site/miauw/widget-auth.php`
- `site/miauw/widget-alerts.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-farmacia-popular.php`
- `site/miauw/guardian-cron.php`
- `site/miauw/farmacia-popular-cron.php`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`

Tabelas principais:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_conhecimentos`
- `miauw_memorias`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_treinos_respostas`
- `miauw_farmacia_popular_valores`
- `miauw_farmacia_popular_atualizacoes`
- `miauw_whatsapp_contacts`
- `miauw_whatsapp_events`
- `miauw_whatsapp_outbox`

Direcao de evolucao:

- evoluir por skills controladas, nao por acesso livre ao banco;
- usar `miauw_skill_registry()` como fonte de inventario das skills antes de novas tools;
- manter a Fase 4 registrada no registry: sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos;
- usar a ponte interna da Cotacao V2 para consultas/encomendas, protegida por token de ambiente;
- manter a Fase 5 com trace por conversa/tool em `miauw_tool_traces`, status no diagnostico, streaming visual no widget/chat e confirmacao humana para acoes fortes antes da escrita;
- manter a Fase 6/7/8 com evals locais para dados obrigatorios, schemas de tools, nao inventar dados, confirmacao de escrita forte, servico sombra e adaptador PHP validados antes do corte;
- preparar a proxima camada por contrato em `miauw_agent_next_phase_contract()`, sem trocar o fluxo PHP/widget ate os testes aprovarem;
- registrar padroes e memorias com revisao e auditoria;
- revisar memorias e padroes pelo painel restrito `/miauw/diagnostico.php`, marcando status sem apagar dados;
- treinar respostas pelo proprio chat com `Boa`/`Treinar`, revisar no painel restrito `/miauw/treino.php` e usar apenas exemplos aprovados no contexto do Miauby;
- preservar versoes de treino: aprovar, rejeitar ou superar sem excluir pergunta/resposta original;
- compilar treinos aprovados em perfil curto e responder localmente quando houver pergunta repetida/fortemente parecida, para reduzir custo e evitar conversa infinita por temas;
- aplicar perfil de voz/tom versionado no contexto do Miauby;
- permitir audio apenas pelo botao `Falar`, com microfone por clique, gravacao temporaria, transcricao revisavel e sem escrita operacional por voz;
- manter o WhatsApp como canal de transporte controlado: Evolution API ou Meta Cloud API entrega webhooks ao `apps/miauw-whatsapp`, o bridge valida token/assinatura/allowlist/prefixo/grupo, grava fila no Postgres dedicado, mostra status seguro em `/miauw/whatsapp/` e chama o agente para resposta curta, sem escrita forte direta pelo WhatsApp;
- permitir que o painel Usuarios vincule contatos da allowlist a `core_users`, mantendo telefone completo cifrado apenas no bridge e usando o vinculo para futuros avisos individuais por funcionario;
- comandos de Gestao entram como tool controlada: leitura por resumo interno e escrita de conta a pagar com titulo, valor, categoria padrao `geral` quando o operador informar so nome + valor, endpoint interno tokenizado e confirmacao humana;
- em comandos de Gestao, uma nova mensagem que comeca por `gestao` sempre substitui pendencia incompleta anterior; complementos so sao usados quando a resposta nao inicia novo comando, evitando juntar prompts antigos com novos lancamentos;
- o formato de criacao aceita `gestao - titulo - 500 - categoria`, `gestao - 500 - titulo`, `gestao - titulo - 500`, `gestao titulo 500` e categoria antes/depois para reduzir erro operacional no celular;
- separar leitura, sugestao e escrita;
- documentacao especifica em `docs/18-miauby-evolucao-generativa.md`.

## WordPress

WordPress fica na raiz `site/` e usa `site/wp-config.php`.

Cuidados:

- A rota `/` esta interceptada por `site/.htaccess` e servida por `site/home.php` durante a estabilizacao da migracao.
- WordPress continua responsavel por `/wp-admin`, `/wp-login.php`, posts, paginas legadas e assets em `/wp-content`.
- O `/wp-login.php` nao segue automaticamente a identidade dos logins internos; em 2026-05-21 foi confirmado que ele permanecia com o cabecalho padrao do WordPress.
- `WP_HOME` e `WP_SITEURL` sao ajustados para localhost em desenvolvimento.
- Em producao, confirmar URLs finais depois do DNS/SSL.
- Plugins vindos do HostGator podem afetar performance.
- Cache deve ser ativado apenas depois de validar redirects e HTTPS.

## Decisoes tecnicas ja tomadas

- Modulos internos ficam dentro da raiz publica ao lado do WordPress.
- Modulos compartilham helpers de autenticacao e banco do Cashback.
- Cotacao V2 deve evoluir com sincronizacao estruturada, nao string solta.
- Home publica temporariamente desacoplada do WordPress para reduzir risco de cache/plugin quebrar a primeira tela.

## Riscos ao alterar

- Quebrar helpers comuns impacta todos os modulos.
- Mudar login/sessao sem teste pode bloquear todos os acessos internos.
- Mudar rotas publicas impacta Nginx, DNS e links existentes.
- Alterar Cotacao sem pensar em Sheets pode dificultar a evolucao principal desejada.

## Pendencias

- Mapear perfis e permissoes por modulo.
- Documentar APIs internas endpoint por endpoint.
- Criar testes de fluxo para login, status do Miauby e operacoes principais.

## Evolucao futura

- Criar docs por modulo quando cada fluxo ganhar mais regras.
- Adicionar diagnostico central com status de banco, API, proxy e jobs.
- Integrar Miauby para resumir pendencias, divergencias e alertas operacionais.
