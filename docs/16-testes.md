# 16 - Testes

## O que esta parte do sistema faz

Registra como o projeto e validado hoje e como deve evoluir para testes automatizados.

## Validacao atual

Hoje a validacao e feita com:

- `docker compose ps`
- `php -l` em arquivos PHP importantes
- `site/miauw/miauw-evals.php` para intents, guardrails e registry do Miauby
- `curl` em rotas principais
- leitura de logs do container web
- teste visual manual quando ha mudanca de tela

## Arquivos, rotas e componentes envolvidos

Rotas de smoke test:

- `/`
- `/wp-login.php`
- `/cashback/login.php`
- `/cashback/health` deve responder JSON 200 quando o servico Cashback e seu Postgres estiverem ativos, com `mode=official`, `auth.provider=core`, `storage.provider=postgres`, `legacy.mysqlImport=false`, `legacy.mysqlMirror=false`, `legacy.mysqlLogs=false` e contagens Postgres.
- `/cashback/autoteste.php` deve exigir sessao/senha sensivel e executar criacao de cliente/compra/credito/resgate em transacao com rollback, sem deixar dado persistido.
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/financeiro/health` deve responder JSON 200 quando o servico Financeiro e seu Postgres estiverem ativos, com `mode=official`, `auth.provider=core`, `storage.provider=postgres` e flags legadas MySQL desligadas/removidas
- `/usuarios/login.php` deve responder 200 e aceitar somente usuario `adm` ou role `admin`
- `/usuarios/health` deve responder JSON 200 quando o servico Usuarios, o core Postgres e o schema central estiverem ativos
- `/tarefa/login.php`
- `/tarefa/health` deve responder JSON 200 quando o servico de Tarefa e seu Postgres estiverem ativos
- `/tarefa/badge.php` deve responder JSON sem segredo com a quantidade de tarefas abertas
- `/gestao/login.php`
- `/gestao/health` deve mostrar `auth.provider=core`, `coreReachable=true`, `mysql_auth=false`, `mysql_auth_fallback=false` e `mysql_reachable=false`
- `/pedidos/` deve exigir sessao e carregar o fluxo visual de pedidos quando autenticado
- `/pedidos/health` deve responder JSON 200 quando o servico de Pedidos estiver ativo e mostrar `auth.provider=core`, `mysql_dependency=false`, `mysql_auth=false` e `mysql_auth_fallback=false`
- `/pedidos/api/badge` deve responder JSON sem segredo com a quantidade total de pedidos ainda em `Aguardando chegada`
- `/gestao/pedidos` deve redirecionar para `/pedidos/` por compatibilidade, sem renderizar a tela da Gestao
- `/xp/login.php` deve responder 200 e carregar a tela de login do XP
- `/xp/health` deve responder JSON 200 quando o schema do XP puder ser preparado
- `/_legacy-disabled/README.md` deve responder 403, confirmando que a quarentena de legado nao fica navegavel
- `/miauw/login.php`
- `/miauw/treino.php` deve exigir sessao e perfil autorizado
- `/miauw/diagnostico.php` deve exigir sessao e perfil autorizado
- `/miauw/widget-status.php`
- `/miauw/agent/health` deve responder JSON 200 sem segredo quando o servico sombra estiver ativo
- `wimifarma-miauby-app:4100/miauby/health` deve responder JSON 200 dentro da rede Docker, com `mode=shadow_read_only`, `write_enabled=false` e sem segredo
- `wimifarma-miauby-app:4100/miauby/api/internal/status` e `/miauby/api/internal/parity?sample=5` devem exigir token interno e retornar contagens/checksums sem payload bruto
- `/miauw/whatsapp/` deve responder HTML 200 com painel seguro quando o login do painel estiver desligado, ou HTML de login/401 quando `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` estiverem configurados
- `/miauw/whatsapp/health` deve responder JSON 200 sem segredo quando o bridge WhatsApp e seu Postgres estiverem ativos
- `wimifarma-miauby-migrator npm run migrate:shadow` deve criar/atualizar `miauby_*` no Postgres sombra sem alterar `/miauw/`; `npm run validate:shadow` deve confirmar contagens da copia quando todas as tabelas fonte existirem
- `http://127.0.0.1:8080` deve responder quando a Evolution API separada estiver ativa no VPS
- `/miauw/agent/run` e `/miauw/agent/stream` devem recusar sem token interno
- `/miauw/agent-tools.php` deve recusar sem token interno e aceitar somente tools de leitura baixa quando chamado pelo servico agente
- `/cotacao/health` deve responder JSON 200 pela Cotacao V2, mostrar `auth.provider=core`, `auth.mysqlDependency=false`, `mysql_auth=false` e `mysql_auth_fallback=false`
- `/cotacao/api/bootstrap` deve exigir sessao e redirecionar/recusar quando nao autenticado

Comandos estao em `docs/05-comandos.md`.

## Miauby - evals locais

O Miauby possui um runner CLI de avaliacoes locais em `site/miauw/miauw-evals.php`.

Ele valida:

- status e versao publica do agente;
- guardrails contra bastidores tecnicos, prompt, stack trace, fornecedor e chaves `sk-...`;
- sanitizacao de codigo/caminhos internos;
- redirect de assuntos tecnicos para suporte tecnico interno;
- registry essencial de skills;
- rotas de modelo `fast`, `smart` e `boss`;
- intents de lancamento financeiro, tarefa, encomenda e urgente de Cotacao.
- Fase 4 das tools core: sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- sangria sem valor nao vira escrita;
- contrato das tools de Codigos (`resumo_codigos` e `buscar_codigo_comissao`).
- Fase 5 do Miauby: status publico anuncia rastreabilidade/confirmacao/streaming visual, acao forte pede confirmacao antes de escrita e traces aparecem no diagnostico.
- Fase 6 do Miauby: contrato da proxima camada, schemas das tools, alinhamento registry/tools online, dados incompletos sem escrita, Cotacao pedindo termo quando falta produto/EAN/categoria, prompt de nao inventar dados e confirmacao obrigatoria para escrita forte por risco.
- Fase 7 do Miauby: status publico anuncia servico sombra, diagnostico inclui status do servico agente e o endpoint `/miauw/agent/health` valida o container Node/TypeScript.
- Fase 8 do Miauby: status publico anuncia adaptador PHP sombra, diagnostico inclui status do adaptador, evals validam skip controlado e similaridade sem chamada online.
- Fase 9 do Miauby: status publico anuncia manutencao/engine switch, diagnostico inclui `agent_runtime`, evals validam engine em lista fechada e `adm` liberado para manutencao/corte.
- Fase 10 do Miauby: persona preservada, diagnostico inclui contrato da voz e `apps/miauw-agent` valida `npm run check:persona` sem chamada online.
- Fase 11 do Miauby: status publico anuncia contratos de tools exportados, contrato aponta `fase11`, diagnostico inclui resumo/checksum dos contratos e o Node aceita `tool_contracts` sem liberar escrita direta.
- Fase 12 do Miauby: status publico anuncia execucao Node de leitura segura, contrato aponta `fase12`, o export de contracts aponta `fase12-node-read-tool-contracts` e o Node lista `consultar_contrato_tool_miauby` em `node_executable_tools`.
- Fase 13 do Miauby: status publico anuncia ponte PHP de leitura, contrato aponta `fase13`, o export de contracts aponta `fase13-php-read-tool-bridge`, as tools de leitura baixa aparecem com `node_read_bridge_enabled` e sangria/escritas seguem bloqueadas no Node.
- Fase 14 do Miauby: status publico anuncia ponte PHP universal, contrato aponta `fase14`, o export de contracts aponta `fase14-php-all-tools-bridge`, as OpenAI tools aparecem com `node_tool_bridge_enabled`, `criar_tarefa` fica como escrita PHP de baixo risco e sangria/escritas fortes retornam `confirmation_required`.
- Fase 15 do Miauby: status publico anuncia roteador de estilo, contrato aponta `fase15`, o export de contracts aponta `fase15-style-router-memory`, perguntas casuais/de bastidor recebem resposta local curta, "como faz um site?" nao vira tutorial numerado e `style_context` chega versionado ao Node com memorias/padroes apenas aprovados.
- Fase 16 do Miauby: status publico anuncia treinador do chat, contrato aponta `fase16`, o export de contracts aponta `fase16-training-feedback`, feedback cria item pendente, revisao aprova exemplo versionado e `style_context` inclui treino aprovado.
- Fase 17 do Miauby: status publico anuncia treino compilado, contrato aponta `fase17`, o export de contracts aponta `fase17-training-compiler`, `style_context` inclui `training_profile`, e pergunta exata aprovada pode responder pelo `miauw-training-router`.
- Fase 18 do Miauby: status publico anuncia perfis de voz/tom, contrato aponta `fase18`, o export de contracts aponta `fase18-voice-audio-readiness`, `style_context` inclui `voice_profile`/`audio_contract`, e audio permanece `text_only` sem captura, playback, transcricao, TTS ou armazenamento.
- Fase 19 do Miauby: status publico anuncia botao de audio controlado, contrato aponta `fase19`, o export de contracts aponta `fase19-record-transcribe-confirm`, `audio_contract` exige acao explicita, usa `gpt-4o-transcribe` por padrao, mantem `storage_enabled=false` e exige revisao antes de enviar; o widget tambem recebe `audio_contract` por `widget-status.php`, tenta captura real antes de concluir bloqueio, mostra rascunho local com player/transcricao e mostra erro amigavel quando o navegador/Windows recusar o microfone.
- Fase 20 do Miauby: status publico anuncia bolha/player de audio e resposta falada, contrato aponta `fase20`, o export de contracts aponta `fase20-voice-reply-audio-bubbles`, `audio_contract` libera playback/TTS somente quando audio estiver configurado, usa `gpt-4o-mini-tts` por padrao, mantem `storage_enabled=false` e bloqueia audio curto ou transcricao grande demais para poucos segundos.
- Fase 21 do Miauby: status publico anuncia playback `blob:` liberado em CSP, seletor de voz no diagnostico e perfil TTS forte; o contrato aponta `fase21`, o export de contracts aponta `fase21-voice-playback-profile-selector`, `audio_contract` lista as vozes permitidas e mantem `storage_enabled=false`.

Rodar pelo container:

```powershell
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
```

O runner nao chama OpenAI e nao executa escritas reais nos modulos.

## Regras que precisam ser preservadas

- Rodar validacoes proporcionais ao risco.
- Se mexer em helper comum, testar todos os modulos.
- Se mexer em banco, testar pelo menos login/status e logs.
- Se mexer em `apps/cashback`, rodar `npm run check`, `npm run build`, validar `/cashback/health`, `/cashback/login.php`, contagens importadas, exportacao CSV e, quando autenticado, `/cashback/autoteste.php`; se mexer no proxy, rebuildar tambem `wimifarma-com-web`.
- Se mexer em Gestao/Pedidos, rodar `npm run check` e `npm run build` nos apps Node afetados, health de `/gestao/health` e/ou `/pedidos/health`, smoke de `/gestao/login.php` e `/pedidos/`, badge `/pedidos/api/badge`, validacao visual da tela afetada e, quando mexer em acesso, confirmar que entrar pelo card `Pedidos` volta para `/pedidos/` apos login.
- Se mexer em XP, rodar `npm run check` e `npm run build` em `apps/xp`, validar `/xp/login.php`, `/xp/health`, home com card XP e, quando possivel, validar visualmente a moldura do card, trilha e upload de foto. Os PHPs antigos de XP ficam em `site/_legacy-disabled/2026-05-29/xp-php/` e nao fazem parte do smoke operacional.
- Se mexer em front-end, validar visualmente.
- Se mexer em Miauby, validar `widget-status.php` e `miauw-evals.php`.
- Se mexer em `apps/miauby`, `wimifarma-miauby-db` ou `wimifarma-miauby-app`, rodar `npm run check`, `npm run build`, migrador sombra, validate sombra, `/miauby/health`, `/miauby/api/internal/status`, `/miauby/api/internal/parity?sample=5`, `php /var/www/html/miauw/miauw-evals.php`, `widget-status.php` e healths dos modulos principais para provar que `/miauw/` e frontend nao foram cortados.
- Se mexer em `apps/miauw-agent`, rodar `npm run check`, `npm run check:persona`, build do servico e validar `/miauw/agent/health`.
- Se mexer em `apps/miauw-whatsapp`, rodar `npm run check`, `npm run build`, validar `/miauw/whatsapp/`, `/miauw/whatsapp/login` quando o login estiver ativo e `/miauw/whatsapp/health`; quando `MIAUW_WHATSAPP_ENABLED=false`, confirmar que o webhook retorna `accepted=false`, e quando estiver ativo, confirmar que webhook sem token/assinatura recusa com 401/503 sem processar mensagem real. Para comandos, validar `site/miauw/agent-actions.php` via chamada interna tokenizada com `sangria 10 Will` e esperar `confirmation_required`, sem executar escrita. No modo Meta, validar tambem `GET /miauw/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
- Se mexer em `apps/usuarios`, rodar `npm run check`, `npm run build`, validar `/usuarios/health`, `/usuarios/login.php`, criacao/desativacao sem apagar fisicamente, permissoes gravadas em `core_user_module_permissions`, cofre administrativo em `core_user_admin_passwords` quando houver troca de senha e historico em `core_user_audit_events`.
- Se mexer em `ops/evolution`, validar `docker compose config` na pasta da stack e, no VPS, `docker compose ps`, `curl http://127.0.0.1:8080` e o health do bridge com `evolution_configured=true`.
- Se mexer no painel de diagnostico do Miauby, validar login local e acesso a `/miauw/diagnostico.php`.

## Decisoes tecnicas ja tomadas

- A fase atual prioriza smoke tests por causa da migracao.
- O Miauby possui primeira camada automatizada de evals locais para intents e respostas proibidas.
- Os evals tambem validam o payload seguro do painel de diagnostico da Fase 3, o registry das tools operacionais da Fase 4, os traces/confirmacoes da Fase 5, as regras operacionais ampliadas da Fase 6, o contrato/status da Fase 7/8/9, o contrato de personalidade da Fase 10, os contratos de tools da Fase 11, a tool Node de leitura segura da Fase 12, a ponte de leitura real da Fase 13, a ponte universal da Fase 14, o roteador de estilo/memoria aprovada da Fase 15, o treinador versionado da Fase 16 e o compilador de treino da Fase 17.

## Riscos ao alterar

- Sem testes automatizados, refatoracoes grandes sao arriscadas.
- WordPress lento pode mascarar erro real.
- APIs com sessao podem parecer quebradas quando retornam 401 esperado.

## Pendencias

- Criar script de auditoria local.
- Criar script de auditoria VPS.
- Adicionar testes de API autenticada.
- Adicionar testes de integridade para Cotacao e Financeiro.
- Adicionar teste de seguranca basico para segredos em Git.
- Ampliar evals do Miauby para alertas, memoria, Farmacia Popular, cashback, erros comuns reais de operador e cenarios do futuro servico Node/TypeScript.
- Ampliar evals online opcionais do Miauby para chamar o Node em modo primario e verificar chamadas reais da ponte PHP de leitura sem executar escrita.
- Criar evals online opcionais que chamem o servico `wimifarma-miauw-agent` em modo sombra/primario controlado e comparem a resposta com o PHP antes de liberar usuarios alem de `adm`.

## Evolucao futura

- Criar `scripts/audit.ps1`.
- Criar `scripts/audit-vps.sh`.
- Adicionar Playwright ou ferramenta equivalente para fluxos visuais.
- Adicionar testes unitarios para regras de calculo.
