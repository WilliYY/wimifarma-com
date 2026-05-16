# 11 - Seguranca

## O que esta parte do sistema faz

Registra cuidados de seguranca ja existentes e riscos encontrados durante a migracao.

## Controles existentes

- `.gitignore` protege `.env`, `mysql/`, backups, dumps, plugins premium e configs locais.
- `.dockerignore` reduz contexto de build.
- `site/cashback/functions.php` envia headers de seguranca em modulos internos.
- CSRF e escape HTML existem nos helpers internos.
- Cookies de sessao usam `HttpOnly` e `SameSite=Lax`.
- A Cotacao V2 usa cookie proprio `WFCOTACAOV2`, sessao em Redis e CSRF por token de sessao.
- A ponte interna do Miauby para a Cotacao V2 exige `X-Miauw-Internal-Token` e fica indisponivel se `COTACAO_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN` nao estiver configurado.
- `/codigos/api.php` reutiliza a sessao `WFWCASHBACK`, exige usuario autenticado e valida CSRF antes de criar blocos de EAN, criar, editar, reordenar ou apagar codigos.
- HSTS e aplicado somente quando a requisicao e HTTPS.
- Miauby possui rotinas de redacao/evita expor alguns dados sensiveis em diagnosticos.
- `/miauw/diagnostico.php` e restrito a `admin`, `gerente` ou `adm`, usa CSRF nas acoes e sanitiza textos de memorias, padroes e diagnosticos antes de exibir.
- A Fase 5 do Miauby exige confirmacao humana para acoes fortes antes de gravar dados e registra traces sanitizados em `miauw_tool_traces`.
- A Fase 6 do Miauby adiciona evals para manter dados incompletos fora de escrita, exigir confirmacao para escrita forte por risco e preservar a regra de nao inventar dados.
- A Fase 7 do Miauby expõe apenas health/status sem segredo em `/miauw/agent/`; `run` e `stream` do servico sombra exigem `X-Miauw-Agent-Token` ou `X-Miauw-Internal-Token` com `MIAUW_AGENT_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN`.
- A Fase 8 chama o servico sombra somente pelo PHP/adaptador com token interno. A comparacao automatica fica desligada por padrao (`MIAUW_AGENT_SHADOW_ON_SEND=false`) e os traces gravam apenas dados sanitizados de comparacao.
- A Fase 9 permite usar o Node como motor oficial apenas por `MIAUW_ENGINE=node` e somente para usuarios em `MIAUW_AGENT_ENGINE_ALLOWED_USERS`; `MIAUW_MAINTENANCE_MODE=true` bloqueia envio de usuarios comuns durante o corte acelerado.

## Arquivos envolvidos

- `.gitignore`
- `.dockerignore`
- `.env.example`
- `apps/cotacao/src/server.js`
- `apps/miauw-agent/src/server.ts`
- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/codigos/api.php`
- `site/wp-config.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/config.local.example.php`
- `cotacao-data/`

## Regras que precisam ser preservadas

- Nunca versionar segredos.
- Nunca publicar MySQL.
- Validar e escapar entrada/saida.
- Usar prepared statements.
- Proteger jobs por token quando forem chamados externamente.
- Revisar permissao antes de expor qualquer endpoint novo.
- Diagnosticos internos do Miauby nao devem exibir stack trace, payload bruto, caminho completo, chave, token, CPF, telefone ou email no painel operacional.
- Traces do Miauby nao devem persistir segredo, chave, token, senha, payload bruto externo, SQL cru ou stack trace completo.
- Acoes fortes por Miauby devem permanecer pendentes ate confirmacao explicita do operador; cancelar deve limpar a acao pendente sem executar escrita.
- Toda nova tool de escrita forte deve entrar no registry com risco correto e ganhar eval antes de ser liberada para uso generativo.
- Nao versionar `COTACAO_POSTGRES_PASSWORD`, `COTACAO_SESSION_SECRET` nem volumes de `cotacao-data/`.
- Nao versionar `COTACAO_INTERNAL_TOKEN` nem `MIAUW_GUARDIAN_TOKEN`; se um deles vazar, trocar no `.env` do VPS e reiniciar web/Cotacao.
- Nao versionar `MIAUW_AGENT_INTERNAL_TOKEN`; se vazar, trocar no `.env` do VPS e reiniciar web/Miauby agente.
- O servico Miauby agente nao deve executar escrita real nem expor payload bruto. Mesmo com `MIAUW_ENGINE=node`, confirmacoes, sessoes e escritas fortes continuam controladas pelo PHP ate cada tool ser migrada e auditada separadamente.
- Rollback de seguranca do Miauby: voltar `MIAUW_ENGINE=php`, desligar `MIAUW_MAINTENANCE_MODE` se a equipe ja puder usar e reiniciar `wimifarma-com-web`.
- Manter palavras de categoria da Cotacao como dados comuns; regras visuais precisam ser explicitas e nao podem virar permissao/gatilho escondido.

## Decisoes tecnicas ja tomadas

- Segredos por ambiente/config local.
- Repositorio tratado como publico.
- SSL via Nginx Proxy Manager, nao diretamente no Apache do container.
- `WP_CACHE` e cache publico ficam desligados por padrao durante migracao para evitar HTML antigo, mixed content e comportamento inesperado.
- A Cotacao V2 reutiliza usuarios de `wf_users`, mas guarda a sessao no Redis do modulo e os dados da planilha no Postgres isolado.
- A Cotacao V2 rejeita API sem sessao e sem CSRF; Socket.IO tambem exige sessao autenticada.

## Riscos ao alterar

- Plugins WordPress herdados podem conter configuracoes antigas.
- Fallbacks legados de autenticacao precisam ser endurecidos.
- Arquivos de upload/cache podem executar codigo se configurados incorretamente.
- Jobs cron sem token forte podem ser abusados.
- Logs podem conter dados internos.
- O painel de diagnostico reduz dados sensiveis, mas ainda e uma tela sensivel e deve permanecer restrito.
- Um `COTACAO_SESSION_SECRET` fraco permite falsificacao de sessao; usar valor longo e exclusivo por ambiente.
- Expor Postgres ou Redis publicamente permitiria leitura/alteracao de dados internos; eles devem ficar apenas na rede Docker.

## Pendencias

- Revisar usuarios e senhas internas.
- Remover credenciais/fallbacks legados.
- Criar politica de backup criptografado.
- Revisar permissao de arquivos no VPS.
- Desabilitar ou proteger `xmlrpc.php` se nao for necessario.
- Criar rotina de varredura de segredos antes de push.
- Criar testes de permissao especificos da Cotacao V2 para API HTTP e Socket.IO.

## Evolucao futura

- Criar checklist de hardening pos-migracao.
- Criar testes de permissao por rota.
- Adicionar monitoramento de tentativas de login.
- Integrar alertas do Miauby com eventos de seguranca.
