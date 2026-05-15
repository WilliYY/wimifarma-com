# 18 - Miauby evolucao generativa

## O que esta parte documenta

Este documento registra a direcao tecnica para evoluir o Miauby como assistente interno generativo, com skills controladas, aprendizado de padroes e automacoes seguras. Ele nao declara funcionalidades prontas; separa o estado real encontrado do desenho recomendado para proximas etapas.

## Estado real atual

Miauby ja possui:

- conversa via `site/miauw/api.php`;
- configuracao OpenAI em `site/miauw/miauw-funcoes.php`;
- roteamento de modelos por tipo de pedido;
- tools controladas em `miauw_openai_tools()`;
- acoes controladas por `miauw_try_controlled_action()`;
- memoria operacional em `miauw_memorias`;
- base de conhecimento em `miauw_conhecimentos`;
- alertas e padroes em `miauw_alertas`, `miauw_alerta_eventos` e `miauw_padroes`;
- varredura operacional em `site/miauw/miauw-intelligence.php`;
- skills de consulta e escrita limitada em `site/miauw/miauw-skills.php`.
- `miauw_skill_registry()` com metadados de modulo, nivel, risco, permissao, executor, entrada, saida, auditoria e efeitos.
- tool `diagnostico_skills` para o Miauby consultar o inventario de capacidades sem expor segredos.
- contador de alertas por `miauw_intelligence_active_alert_count()`, evitando carregar listas completas apenas para badges/status.
- busca de conhecimento em `miauw_knowledge_for()` com pre-filtro por termos relevantes antes do ranking, para manter o contexto generativo mais rapido conforme a memoria crescer.
- alerta de encomenda da Cotacao limitado a itens com mais de 1 dia sem baixa/pedido, com comentario operacional curto enviado aos baloes do widget em todos os modulos.
- widget com chamadas `Accept: application/json`, `X-Requested-With: XMLHttpRequest` e parser tolerante para recuperar payload JSON quando a resposta vier com aviso/ruido externo antes ou depois do objeto.
- endpoints JSON do widget (`widget-status.php`, `widget-auth.php`, `widget-alerts.php` e `api.php`) limpam buffer de saida antes de responder para evitar HTML/avisos misturados com JSON dentro da Cotacao V2.
- apos login pelo widget, o frontend confirma `widget-status.php` imediatamente para validar que o cookie de sessao foi preservado; se voltar anonimo, mostra erro claro de sessao/cookie.
- `config.local.php` so e carregado quando existe e esta legivel pelo PHP; se o arquivo local existir sem permissao de leitura, o Miauby deve continuar subindo usando variaveis do `.env` em vez de quebrar com erro fatal.
- `widget-status.php` diferencia chave configurada de chamada online validada: `api_ready` significa apenas chave preenchida e `api_status.validated=false` indica que a validacao real acontece quando o Miauby tenta responder.
- falhas da camada online do Miauby classificam autenticacao, cota, modelo e rede; o widget mostra uma mensagem curta para o operador e registra diagnostico interno sem expor chave, payload ou stack trace.
- Fase 1 do agente operacional v2 iniciada no backend PHP atual:
  - `MIAUW_AGENT_VERSION` e `MIAUW_AGENT_POLICY_VERSION`;
  - `miauw_agent_public_status()` exposto em `widget-status.php` e `api.php`;
  - prompt com isolamento operacional v2;
  - guardrail final para remover mencoes a agente de desenvolvimento, fornecedor de IA, chave, prompt e stack trace das respostas/historico exibidos ao operador;
  - assuntos tecnicos sao encaminhados como suporte tecnico interno, sem citar bastidores de desenvolvimento.
- Fase 2 do agente operacional v2 iniciada com `site/miauw/miauw-evals.php`, runner CLI de avaliacoes locais:
  - valida status/versao publica do agente;
  - valida guardrails contra bastidor tecnico e chaves `sk-...`;
  - valida sanitizacao de codigo/caminhos internos;
  - valida redirect de assuntos tecnicos para suporte tecnico interno;
  - valida registry essencial de skills;
  - valida rotas `fast`, `smart` e `boss`;
  - valida intents de lancamento financeiro, tarefa, encomenda e urgente de Cotacao;
  - nao chama OpenAI e nao executa escritas reais nos modulos.
- Fase 3 do agente operacional v2 iniciada com `/miauw/diagnostico.php`:
  - painel restrito a `admin`, `gerente` ou usuario `adm`;
  - mostra status publico do agente/API, modelos, registry de skills, alertas e diagnosticos internos recentes;
  - lista memorias e padroes pendentes para revisao;
  - aprovar/ignorar memoria ou padrao apenas marca `revisao_status` e registra `wf_logs`, sem apagar dados;
  - sanitiza textos do painel para reduzir risco de expor segredo, CPF, telefone, email ou bastidor tecnico.
- Fase 4 do agente operacional v2 iniciada:
  - `miauw_skill_core_tool_names()` define as tools core migradas;
  - registry cobre sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos;
  - `resumo_codigos` e `buscar_codigo_comissao` consultam `wf_codigos_comissao`;
  - `registrar_sangria` encapsula lancamento financeiro como categoria `Sangria`;
  - `criar_tarefa` tambem virou OpenAI tool controlada, alem da acao local ja existente;
  - consulta de Cotacao usa a Cotacao V2 por `GET /cotacao/api/internal/search`;
  - criacao de encomenda usa a Cotacao V2 por `POST /cotacao/api/internal/encomendas`;
  - endpoints internos da Cotacao exigem token por `X-Miauw-Internal-Token` e ficam desativados sem token de ambiente.
- Fase 5 do agente operacional v2 iniciada:
  - `miauw_tool_traces` registra trace por conversa/request/tool, com status, risco, resumo sanitizado, duracao e confirmacao;
  - `/miauw/diagnostico.php` mostra estatisticas de traces das ultimas 24h e tools recentes;
  - `api.php?action=send` gera `trace_id` por mensagem e associa user/assistant/tool quando possivel;
  - acoes fortes locais e tools de escrita de alto risco ficam pendentes ate confirmacao humana;
  - o widget e a tela principal mostram resposta digitando visualmente e renderizam card de confirmacao com `Confirmar`/`Cancelar`.

## Arquivos, tabelas e servicos envolvidos

Arquivos:

- `site/miauw/api.php`
- `site/miauw/diagnostico.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-evals.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-system-map.php`
- `site/miauw/guardian-cron.php`
- `site/miauw/widget-status.php`

Tabelas:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_memorias`
- `miauw_conhecimentos`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_configuracoes`
- `miauw_tool_traces`

Integracoes:

- OpenAI Responses API;
- rotinas locais dos modulos Cashback, Cotacao, Financeiro e Tarefas;
- futuro Google Sheets para Cotacao.

## Regras de negocio que precisam ser preservadas

- Miauby nao deve ter acesso livre para executar SQL arbitrario.
- Toda escrita importante deve passar por ferramenta controlada, validada e auditavel.
- Memorias e padroes nao podem armazenar senhas, tokens, chaves, CPF/telefone sem necessidade ou dados sensiveis em texto solto.
- Revisao de memorias e padroes deve marcar status e manter historico; nao apagar dado automaticamente por clique operacional.
- Respostas generativas devem separar fato real, inferencia e proximo passo.
- Balões do widget devem ser curtos, sem codigo, e usar o comentario do alerta quando existir. Para encomendas da Cotacao, comentar apenas quando passou de 1 dia.
- A autonomia deve ser gradual: primeiro diagnosticar, depois sugerir, depois executar apenas acoes pequenas com trilha de auditoria.
- Cotacao + Sheets precisa de IDs estaveis e controle de conflito antes de qualquer automacao generativa de sync.

## Decisoes tecnicas recomendadas

- Manter o registro formal de skills com nome, modulo, permissao exigida, schema de entrada, schema de saida, risco e funcao PHP executora.
- Separar skills em tres niveis:
  - leitura: consulta dados e gera resumo;
  - sugestao: detecta padroes e propoe proximo passo;
  - escrita: altera dados somente com validacao e auditoria.
- Usar `miauw_skill_registry()` antes de adicionar novas tools soltas.
- Manter avaliacoes simples de skills em `site/miauw/miauw-evals.php`: exemplos de entrada, saida esperada e casos proibidos.
- Usar `miauw_padroes` como memoria operacional resumida, nao como caixa de texto infinito.
- Manter a tela de diagnostico do Miauby mostrando API, modelo, skills ativas, ultimos alertas, ultimos padroes e falhas recentes.
- A tela de diagnostico usa o status publico (`configured`, `validated`, `status`) e nao chama a OpenAI automaticamente. Um teste online explicito ainda pode ser adicionado depois.
- Preferir respostas operacionais e sem codigo para usuarios finais. Codigo, SQL, stack trace e comandos devem aparecer apenas em contexto tecnico autorizado.
- Medir latencia do widget e da API antes de aumentar contexto, modelos ou autonomia. Primeiro otimizar consultas, cache e tools controladas.

## Riscos ao alterar

- Adicionar tool generativa sem schema pode criar escrita indevida no banco.
- Aprendizado automatico sem filtro pode cristalizar erro operacional.
- Respostas longas demais no widget podem atrapalhar fluxo do funcionario.
- Aumentar contexto demais pode elevar custo e lentidao.
- Misturar comandos de financeiro, cotacao e cashback pode registrar dado no modulo errado.
- Otimizacoes de contexto podem esconder conhecimento antigo se o pre-filtro for estreito demais; manter fallback para conhecimentos recentes e revisar com exemplos reais.

## Pendencias

- Mapear todas as tools atuais de `miauw_openai_tools()` contra o registry e remover divergencias.
- Ampliar testes de exemplos para intents de alertas, cotacao rapida, memoria e ferramentas OpenAI registradas.
- Ampliar a tela administrativa de revisao com filtros por status/modulo e edicao controlada de memoria/padrao quando houver politica definida.
- Evoluir a Fase 5 de streaming visual para streaming online real em um servico dedicado quando houver separacao Node/TypeScript/Agents SDK.
- Implementar Fase 6: ampliar evals para nao citar bastidores, sangria exigir valor, nao inventar dados, Cotacao pedir produto quando faltar e acoes destrutivas exigirem confirmacao.
- Criar metricas simples de tempo para `widget-status.php`, `api.php?action=send` e uso de conhecimentos.

## Como pode evoluir

- Fase 1: documentar tools atuais, criar registry e aplicar isolamento operacional/persona v2 sem trocar arquitetura. Em andamento/concluido parcialmente.
- Fase 2: adicionar testes de intents e respostas proibidas. Em andamento com runner CLI local.
- Fase 3: criar painel de diagnostico e revisao de memoria/padroes. Em andamento com painel restrito e revisao por status.
- Fase 4: migrar tools importantes para registry e executores controlados. Em andamento com sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- Fase 5: adicionar streaming e rastreabilidade por conversa, incluindo log de tool usada e confirmacao para acoes fortes. Em andamento com streaming visual, traces estruturados e card de confirmacao.
- Fase 6: ampliar evals operacionais para regras proibidas, dados faltantes e confirmacao de acoes destrutivas.
