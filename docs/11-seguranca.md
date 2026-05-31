# 11 - Seguranca

## O que esta parte do sistema faz

Registra cuidados de seguranca ja existentes e riscos encontrados durante a migracao.

## Controles existentes

- `.gitignore` protege `.env`, `mysql/`, backups, dumps, plugins premium e configs locais.
- `.dockerignore` reduz contexto de build.
- `site/cashback/functions.php` envia headers de seguranca em modulos internos.
- CSRF e escape HTML existem nos helpers internos.
- Cookies de sessao usam `HttpOnly` e `SameSite=Lax`.
- A home `/` usa sessao propria `WFHOME` com cookie `HttpOnly`/`SameSite=Lax`, CSRF no formulario de login e botao `Sair`; a credencial temporaria padrao `adm`/`adm` deve ser trocada por variaveis de ambiente (`WIMIFARMA_HOME_LOGIN_USER`/`WIMIFARMA_HOME_LOGIN_PASSWORD`) quando sair da fase de ajuste visual.
- A Cotacao V2 usa cookie proprio `WFCOTACAOV2`, sessao em Redis e CSRF por token de sessao.
- A ponte interna do Miauby para a Cotacao V2 exige `X-Miauw-Internal-Token` e fica indisponivel se `COTACAO_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN` nao estiver configurado.
- `/cashback/` e atendido pelo servico Node `apps/cashback`, usa sessao propria `WFCASHBACK`, autentica somente por `core_users`, valida CSRF antes de criar cliente, compra, resgate, configuracao, atendente ou status de WhatsApp, e grava auditoria em Postgres.
- `/cashback/internal/migration-status` e `/cashback/api/internal/summary` exigem `X-Miauw-Internal-Token` ou `X-Cashback-Internal-Token`; sem `CASHBACK_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN` configurado, recusam com 503. Esses endpoints retornam resumo/contagem operacional, sem segredo nem payload bruto.
- `/codigos/api.php` e atendido pelo servico Node `apps/codigos`, usa sessao propria `WFCODIGOS`, autentica somente por `core_users`, valida CSRF antes de criar blocos de EAN, criar, editar, reordenar ou apagar codigos e grava auditoria em Postgres/core.
- `/codigos/api/internal/summary` e `/codigos/api/internal/search` exigem `X-Miauw-Internal-Token` ou `X-Codigos-Internal-Token`; sem `CODIGOS_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN` configurado, recusam com 503. Esses endpoints retornam apenas resumo/lista de codigos, sem segredo nem payload bruto.
- `/xp/` usa sessao propria `WFXP` no servico Node, exige usuario autenticado para visualizar, restringe alimentacao de dados a `adm`, `admin` ou `gerente`, valida CSRF e valida fotos por tipo real, tamanho e dimensoes antes de salvar.
- `/usuarios/` usa sessao propria `WFUSUARIOS` no servico Node, autentica contra `core_users`, restringe o painel a `adm` ou role `admin`, valida CSRF nas acoes e registra auditoria central sem salvar senha ou hash em logs.
- O painel Usuarios nao recupera senhas antigas por hash. Para a necessidade operacional interna, senhas criadas ou redefinidas pelo ADM ficam em um cofre cifrado `core_user_admin_passwords`, visivel apenas no painel administrativo. `core_users.password_hash` continua sendo a unica credencial usada para autenticar; logs e auditoria nunca devem guardar a senha.
- `/gestao/` usa sessao propria `WFGESTAO` persistida no Postgres da Gestao, autentica somente contra `core_users`, restringe acesso a `adm`, `admin` ou `gerente`, valida CSRF nas acoes e usa queries parametrizadas para lancar contas, adicionar itens/juros, registrar pagamentos parciais, confirmar saldo, cancelar ou reabrir contas. Desde 2026-05-30 nao ha fallback `wf_users` nem `mysql2` no app.
- `/pedidos/api/internal/arrival-summary` e `/pedidos/api/internal/confirm-arrival` exigem `X-Miauw-Internal-Token` ou `X-Pedidos-Internal-Token`; sem `PEDIDOS_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN` configurado, recusam com 503. O resumo retorna apenas titulos/valores/datas de pedidos aguardando chegada, e a confirmacao grava somente chegada auditada, nao pagamento.
- `/financeiro/api/internal/cash-closing-status` e demais endpoints internos do Financeiro exigem `X-Miauw-Internal-Token` ou `X-Financeiro-Internal-Token`; sem `FINANCEIRO_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN` configurado, recusam com 503. O status de fechamento retorna apenas resumo do dia para automacoes, sem payload bruto nem segredo.
- Em 2026-05-31, a home `/`, Codigos, Financeiro e o painel `/miauw/whatsapp/` passaram a enviar o baseline de headers `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` e `Strict-Transport-Security` em HTTPS. A CSP da home e do painel WhatsApp permite `unsafe-inline` somente para preservar os templates atuais com CSS/JS embutidos; objetos e frame externo seguem bloqueados.
- Em 2026-05-31, `site/cashback`, `site/financeiro` e `site/tarefa` ganharam `.htaccess` local com `Options -Indexes` e bloqueio de `*.php`, `*.phtml` e `*.phar` por HTTP. Isso preserva assets e includes internos, mas impede que telas antigas em PHP/MySQL voltem a responder se o proxy Node/Postgres for removido por engano.
- HSTS e aplicado somente quando a requisicao e HTTPS.
- `Permissions-Policy` bloqueia camera e geolocalizacao; microfone fica liberado apenas para a propria origem (`microphone=(self)`) para permitir o botao de audio do Miauby, que ainda exige clique explicito do usuario.
- O login Node do Cashback usa somente `core_users` e `core_login_rate_limits` no Postgres, alem do bloqueio por sessao; nao ha fallback MySQL no app desde 2026-05-30. O login PHP do Miauby tambem usa core por padrao, mantendo `wf_users`/`wf_login_rate_limits` apenas como rollback opt-in onde ainda existir.
- A Cotacao V2 tambem limita tentativas de login por sessao e por chave em memoria `IP + usuario`, regenera a sessao apos login valido e envia headers de seguranca equivalentes aos modulos Node administrativos.
- `xmlrpc.php` do WordPress fica bloqueado por `.htaccess` enquanto nao houver uso operacional confirmado de XML-RPC.
- `site/wp-content/uploads/.htaccess` e `site/xp/uploads/.htaccess` bloqueiam listagem e execucao de scripts em pastas de upload versionadas.
- `scripts/check-secrets.ps1` faz uma varredura local dos arquivos versionados antes de push para detectar chaves, tokens, blocos de chave privada e atribuicoes obvias de segredo.
- Miauby possui rotinas de redacao/evita expor alguns dados sensiveis em diagnosticos.
- `/miauw/diagnostico.php` e restrito a `admin`, `gerente` ou `adm`, usa CSRF nas acoes e sanitiza textos de memorias, padroes e diagnosticos antes de exibir.
- A Fase 5 do Miauby exige confirmacao humana para acoes fortes antes de gravar dados e registra traces sanitizados em `miauw_tool_traces`.
- A Fase 6 do Miauby adiciona evals para manter dados incompletos fora de escrita, exigir confirmacao para escrita forte por risco e preservar a regra de nao inventar dados.
- A Fase 7 do Miauby expõe apenas health/status sem segredo em `/miauw/agent/`; `run` e `stream` do servico sombra exigem `X-Miauw-Agent-Token` ou `X-Miauw-Internal-Token` com `MIAUW_AGENT_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN`.
- A Fase 8 chama o servico sombra somente pelo PHP/adaptador com token interno. A comparacao automatica fica desligada por padrao (`MIAUW_AGENT_SHADOW_ON_SEND=false`) e os traces gravam apenas dados sanitizados de comparacao.
- A Fase 9 permite usar o Node como motor oficial apenas por `MIAUW_ENGINE=node` e somente para usuarios em `MIAUW_AGENT_ENGINE_ALLOWED_USERS`; `MIAUW_MAINTENANCE_MODE=true` bloqueia envio de usuarios comuns durante o corte acelerado.

- A Fase 10 preserva a personalidade do Miauby no Node sem relaxar guardrails: humor e bordoes nao autorizam inventar dado, expor bastidor ou executar acao forte sem confirmacao.
- A Fase 11 envia contratos de tools do PHP para o Node como contexto seguro. Esses contratos nao carregam segredos, nao liberam escrita direta no Node e mantem `execution_owner`/`confirmation_owner` no PHP.
- A Fase 12 permite ao Node executar somente `consultar_contrato_tool_miauby`, uma tool de leitura segura sobre contratos ja sanitizados. Ela nao consulta banco, nao grava dados e nao muda `writes_enabled=false`.
- A Fase 13 adiciona `/miauw/agent-tools.php` como ponte interna protegida por `X-Miauw-Agent-Token`/`MIAUW_AGENT_INTERNAL_TOKEN`. Ela aceita somente tools de leitura baixa explicitamente listadas, registra trace sanitizado e mantem `writes_enabled=false`; o Node segue sem acesso direto a banco ou segredos de modulo.
- A Fase 19 usa audio por gravacao temporaria/transcricao confirmada pelo servidor PHP, sem enviar chave ao navegador. Microfone so liga por clique, o arquivo nao e armazenado, o player do rascunho fica local no navegador, a transcricao vira rascunho revisavel e voz nao pode executar escrita operacional direta; acoes fortes continuam exigindo confirmacao no fluxo auditado.
- A Fase 20 mostra audio enviado como player local e gera resposta falada temporaria no PHP sem gravar arquivo no banco/disco. A transcricao continua como texto interno para contexto e auditoria, audio curto demais e bloqueado para reduzir chute, e falha de TTS cai para texto normal sem liberar escrita por voz.
- A Fase 21 permite `blob:`/`data:` apenas em `media-src` para os players temporarios do chat/widget, mantendo scripts, frames e origens externas bloqueados. O seletor de voz no diagnostico salva somente um ID de voz permitido em `miauw_configuracoes`, nunca chave, sample de audio ou arquivo de voz.
- O bridge WhatsApp do Miauby (`apps/miauw-whatsapp`) nasce desligado no repositorio, exige token de webhook quando ligado, usa allowlist de remetentes, bloqueia grupos por padrao, limita respostas por mensagem, aplica rate limit por remetente e global, respeita intervalo minimo entre envios, pausa em erro temporario do transporte e guarda no Postgres apenas hash/mascara e identificadores cifrados para resposta/allowlist, sem payload bruto da Evolution. A comparacao de remetente considera equivalencias com/sem DDI `55` e com/sem nono digito brasileiro. Permissoes de cards por contato ficam vinculadas ao hash do telefone autorizado.
- Numeros locais na allowlist podem usar `MIAUW_WHATSAPP_DEFAULT_DDD`, mas qualquer comparacao por sufixo deve exigir no minimo 8 digitos. Nunca aceitar tokens curtos como DDD isolado, final de telefone de 2 a 4 digitos ou partes geradas por espaco como liberacao valida.
- O audio do bridge WhatsApp fica desligado por padrao. Quando ligado, audio recebido passa por allowlist antes de qualquer download, tem tamanho limitado por `MIAUW_WHATSAPP_AUDIO_MAX_BYTES`, e os bytes ficam somente em memoria para transcricao Gemini. O banco pode guardar transcricao e metadados sanitizados da midia, nunca audio bruto, URL temporaria, token ou payload completo do transporte. Resposta em audio usa TTS configuravel e deve cair para texto se falhar, sem repetir envio em loop.
- Antes de acionar o core/tools pelo WhatsApp, o bridge deve conferir se o card detectado na mensagem ou na tool retornada esta liberado para o telefone. Se nao estiver, responder bloqueado e orientar ajuste no painel, sem chamar execucao interna.
- O modo hibrido do WhatsApp pode usar Gemini para conversa simples, mas comandos internos continuam roteados para o core Miauby com permissao/guardrail. Em ambiente revisado, `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true` permite comandos operacionais claros sem a palavra `miauby`, desde que o remetente esteja em allowlist, o card esteja liberado e a acao vire pendencia/confirmacao. Chaves Gemini devem ficar apenas no `.env`, e o contexto enviado ao Gemini deve ser sanitizado, sem telefone completo, token, payload bruto, dados financeiros/clientes ou credenciais.
- `site/miauw/agent-context.php` e endpoint interno tokenizado para compartilhar com o WhatsApp o mesmo treino aprovado, perfil de voz e contratos de tools do Miauby interno. Ele aceita apenas POST com `X-Miauw-Agent-Token`/`X-Miauw-Internal-Token`, nao executa escrita e nao deve ser chamado sem token.
- `site/miauw/agent-actions.php` e endpoint interno tokenizado para preparar e executar acoes confirmadas vindas do WhatsApp. A execucao depende de `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true`, allowlist de tools, allowlist de remetentes no bridge e pendencia vigente em `miauw_whatsapp_confirmations`; texto solto `sim/nao` sem pendencia nao executa nada.
- O painel do bridge WhatsApp pode exigir login por `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`; a sessao usa cookie `HttpOnly`, `SameSite=Lax`, assinatura HMAC e TTL configuravel, enquanto `/miauw/whatsapp/health` permanece publico e sem segredo para monitoramento. A edicao de allowlist, nome/numero e cards liberados no painel exige a sessao do painel e token CSRF derivado da sessao.
- Marcar erro como resolvido pelo painel apenas atualiza `resolved_at`; nao apaga historico, payload sanitizado nem evidencia de falha.

## Arquivos envolvidos

- `.gitignore`
- `.dockerignore`
- `.env.example`
- `apps/cashback/src/server.ts`
- `apps/cotacao/src/server.js`
- `apps/codigos/src/server.ts`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`
- `site/miauw/agent-tools.php`
- `site/miauw/agent-actions.php`
- `site/cashback/config.php`
- `site/cashback/functions.php`
- `apps/xp/src/server.ts`
- `site/xp/uploads/.htaccess`
- `site/wp-content/uploads/.htaccess`
- `apps/gestao/src/server.ts`
- `apps/cotacao/src/server.js`
- `site/_legacy-disabled/.htaccess`
- `site/_legacy-disabled/2026-05-29/` (quarentena de legado PHP sem acesso web)
- `site/wp-config.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/config.local.example.php`
- `scripts/check-secrets.ps1`
- `cotacao-data/`

## Regras que precisam ser preservadas

- Nunca versionar segredos.
- Nunca publicar MySQL.
- Validar e escapar entrada/saida.
- Usar prepared statements.
- Proteger jobs por token quando forem chamados externamente.
- Revisar permissao antes de expor qualquer endpoint novo.
- Uploads de fotos do XP devem continuar restritos a imagens reais JPG/PNG/WEBP, sem aceitar nome original como destino e sem permitir execucao/listagem na pasta publica.
- Dados da Gestao sao administrativos e financeiros; nao expor contas, categorias livres, itens, pagamentos, saldos ou observacoes em endpoints publicos, logs detalhados ou contexto generativo sem filtro/confirmacao futura. `wimifarma-gestao-db` nao deve ser publicado fora da rede Docker.
- Diagnosticos internos do Miauby nao devem exibir stack trace, payload bruto, caminho completo, chave, token, CPF, telefone ou email no painel operacional.
- Traces do Miauby nao devem persistir segredo, chave, token, senha, payload bruto externo, SQL cru ou stack trace completo.
- Acoes fortes por Miauby devem permanecer pendentes ate confirmacao explicita do operador; cancelar deve limpar a acao pendente sem executar escrita.
- Toda nova tool de escrita forte deve entrar no registry com risco correto e ganhar eval antes de ser liberada para uso generativo.
- Nao versionar `COTACAO_POSTGRES_PASSWORD`, `COTACAO_SESSION_SECRET` nem volumes de `cotacao-data/`.
- Nao versionar `CASHBACK_POSTGRES_PASSWORD`, `CASHBACK_SESSION_SECRET`, `CASHBACK_INTERNAL_TOKEN` nem volumes de `cashback-data/`.
- Nao versionar `CODIGOS_POSTGRES_PASSWORD`, `CODIGOS_SESSION_SECRET` nem volumes de `codigos-data/`.
- Nao versionar `CODIGOS_INTERNAL_TOKEN`; se vazar, trocar junto do token interno usado pelo Miauby e reiniciar web/Codigos.
- Nao versionar `COTACAO_INTERNAL_TOKEN` nem `MIAUW_GUARDIAN_TOKEN`; se um deles vazar, trocar no `.env` do VPS e reiniciar web/Cotacao.
- Nao versionar `MIAUW_AGENT_INTERNAL_TOKEN`; se vazar, trocar no `.env` do VPS e reiniciar web/Miauby agente.
- Nao versionar `MIAUW_OPENAI_API_KEY`; as rotas de audio usam a chave somente no PHP para transcrever audio temporario e gerar resposta falada sem expor segredo ao navegador.
- Nao clonar ou tentar reproduzir voz de pessoa/personagem/video sem consentimento; referencias externas podem orientar apenas ritmo, energia, velocidade e tom geral do perfil do Miauby.
- O servico Miauby agente nao deve executar escrita real nem expor payload bruto. Mesmo com `MIAUW_ENGINE=node`, confirmacoes, sessoes e escritas fortes continuam controladas pelo PHP ate cada tool ser migrada e auditada separadamente. Quando o Node identifica uma tool forte, ele deve retornar evento de confirmacao para o PHP criar o card na sessao do operador; texto solto de confirmacao sem sessao nao deve ser tratado como execucao.
- A ponte `/miauw/agent-tools.php` nao substitui sessao/CSRF dos modulos para uso publico; ela e exclusivamente interna, tokenizada, limitada a leitura baixa e deve continuar inacessivel sem token.
- Contratos de tools enviados ao Node devem permanecer sanitizados: sem token, chave, SQL bruto, payload externo ou stack trace; schemas podem descrever parametros operacionais, mas nao segredo de ambiente.
- Rollback de seguranca do Miauby: voltar `MIAUW_ENGINE=php`, desligar `MIAUW_MAINTENANCE_MODE` se a equipe ja puder usar e reiniciar `wimifarma-com-web`.
- Manter palavras de categoria da Cotacao como dados comuns; regras visuais precisam ser explicitas e nao podem virar permissao/gatilho escondido.
- Qualquer webhook externo para Miauby no WhatsApp deve validar token proprio ou assinatura oficial, instancia/telefone, evento e remetente antes de chamar o agente; a primeira versao deve usar allowlist de numeros e ignorar grupos/clientes desconhecidos.
- O webhook `/miauw/whatsapp/webhook` deve continuar protegido por `MIAUW_WHATSAPP_WEBHOOK_TOKEN` ou, no modo Meta, por `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` e preferencialmente `META_WHATSAPP_APP_SECRET` com `X-Hub-Signature-256`; se o canal estiver ligado sem token/cifragem, deve recusar processamento.
- Numeros publicos de atendimento, como o WhatsApp do Cashback, nao devem acionar o Miauby interno sem prefixo/allowlist. O canal WhatsApp nao pode expor dados de cliente, financeiro, cotacao ou gestao para remetente nao autenticado. Remetente fora da allowlist pode receber apenas aviso padrao de canal interno, sem Gemini, core ou tool.
- Automacoes n8n do WhatsApp, como chegada de pedidos e fechamento de caixa, devem chamar apenas endpoints internos tokenizados do Miauby. O n8n nao deve acessar banco de negocio nem escolher telefone manualmente; o bridge calcula destinatarios pelos cards liberados (`Pedidos`, `Financeiro`) e ignora LIDs protegidos.
- O Miauby WhatsApp deve bloquear no bridge dado sensivel antes de chamar Gemini/core. Escrita forte sem `miauby` so pode ir ao core quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true` em ambiente com allowlist/cards revisados; mesmo assim vira tool auditada/`confirmation_required`, sem gravacao direta pelo WhatsApp e sem aceitar `confirmar` por mensagem solta.
- Audio transcrito segue exatamente os mesmos guardrails de texto: conversa simples fica no Gemini, comando operacional detectado pode acionar core/tools conforme permissao, e escrita forte exige pendencia/confirmacao. Nao aceitar audio como atalho para burlar allowlist, card liberado ou confirmacao.
- Confirmacoes por WhatsApp so podem executar acoes depois de pendencia criada pelo bridge, expirada automaticamente, vinculada ao hash do remetente e a uma tool liberada. O botao interativo e uma conveniencia de UI; a garantia real e a pendencia no banco + token interno + allowlist. Respostas `SIM`/`NAO` ou cliques em botao podem passar sem prefixo `miauby` apenas para resolver pendencia ativa, nunca para criar escrita nova.
- Leitura de comprovante Pix por midia deve conferir allowlist e card `Financeiro` antes de baixar/OCR via Gemini, manter midia somente em memoria, limitar tamanho e descartar bytes apos extracao. O backend pode usar legenda/nome do arquivo e fallback sobre OCR sanitizado, mas nao deve persistir `raw_text` completo, URL temporaria ou payload bruto.
- Payloads brutos da Evolution API ou WhatsApp nao devem ser persistidos em traces/logs; registrar apenas metadados sanitizados, telefone mascarado, trechos curtos de mensagem/resposta quando necessarios para sincronia operacional, status, latencia e erro resumido.
- O painel `/miauw/whatsapp/` deve continuar limitado a status, contadores, motivos de ignorado, latencia e telefones mascarados fora da allowlist. A unica excecao permitida e o telefone completo decifrado dentro da edicao da allowlist autenticada e protegida por CSRF, para permitir correcao operacional de numeros. Nunca adicionar token ou payload bruto ao HTML. Em producao, manter `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` preenchidos no `.env`.
- O Apache do container web usa formato de access log sem query string (`%m %U %H`) para evitar gravar tokens de webhook passados por URL. Nao trocar de volta para `%r`/query completa sem sanitizacao.
- A Evolution API deve ficar fechada em `127.0.0.1:8080` e na rede Docker interna. Nao publicar `wimifarma-evolution-api` no Nginx Proxy Manager sem autenticar e revisar superficie de ataque.
- Segredos de Evolution API, Meta Cloud API, tokens de webhook e chaves de provedores alternativos como Gemini devem ficar apenas em `.env`/config local e entrar na varredura de segredos antes do push.
- `MIAUW_WHATSAPP_ENCRYPTION_KEY`, `MIAUW_WHATSAPP_WEBHOOK_TOKEN`, `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`, `EVOLUTION_API_KEY`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`, `GEMINI_API_KEY` e `MIAUW_WHATSAPP_POSTGRES_PASSWORD` nunca devem ser versionados. Se vazarem, trocar no `.env` do VPS e reiniciar `wimifarma-miauw-whatsapp`.
- `MIAUW_WHATSAPP_CONTEXT_URL` deve apontar apenas para endpoint interno confiavel; o token usado para buscar contexto e o mesmo segredo interno do agent e nunca deve aparecer em logs, HTML ou commit.

## Decisoes tecnicas ja tomadas

- Segredos por ambiente/config local.
- Repositorio tratado como publico.
- SSL via Nginx Proxy Manager, nao diretamente no Apache do container.
- `WP_CACHE` e cache publico ficam desligados por padrao durante migracao para evitar HTML antigo, mixed content e comportamento inesperado.
- A Cotacao V2 autentica somente contra `core_users` no Postgres do core, sem fallback MySQL, mas guarda a sessao no Redis do modulo e os dados da planilha no Postgres isolado.
- A Cotacao V2 rejeita API sem sessao e sem CSRF; Socket.IO tambem exige sessao autenticada.

## Riscos ao alterar

- Plugins WordPress herdados podem conter configuracoes antigas.
- Fallbacks legados de autenticacao precisam ser endurecidos.
- Arquivos de upload/cache podem executar codigo se configurados incorretamente.
- Jobs cron sem token forte podem ser abusados.
- A senha temporaria `adm`/`adm` da home protege apenas a tela de cards e nao deve ser tratada como controle forte; mover para senha de ambiente ou integrar ao core quando a politica final de acesso da home for definida.
- Logs podem conter dados internos.
- O painel de diagnostico reduz dados sensiveis, mas ainda e uma tela sensivel e deve permanecer restrito.
- Um `COTACAO_SESSION_SECRET` fraco permite falsificacao de sessao; usar valor longo e exclusivo por ambiente.
- Expor Postgres ou Redis publicamente permitiria leitura/alteracao de dados internos; eles devem ficar apenas na rede Docker.
- Se algum aplicativo externo depender de XML-RPC do WordPress, o bloqueio atual em `site/.htaccess` precisara ser reavaliado com allowlist ou autenticacao especifica.

## Pendencias

- Revisar usuarios e senhas internas.
- Remover credenciais/fallbacks legados.
- Criar politica de backup criptografado.
- Revisar permissao de arquivos no VPS.
- Avaliar se o bloqueio de `xmlrpc.php` pode continuar permanente.
- Rodar `powershell -ExecutionPolicy Bypass -File scripts/check-secrets.ps1` antes de pushes com alteracao sensivel.
- Criar testes de permissao especificos da Cotacao V2 para API HTTP e Socket.IO.

## Evolucao futura

- Criar checklist de hardening pos-migracao.
- Criar testes de permissao por rota.
- Adicionar monitoramento de tentativas de login.
- Integrar alertas do Miauby com eventos de seguranca.
