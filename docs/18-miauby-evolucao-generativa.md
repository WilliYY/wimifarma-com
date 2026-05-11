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

## Arquivos, tabelas e servicos envolvidos

Arquivos:

- `site/miauw/api.php`
- `site/miauw/miauw-funcoes.php`
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

Integracoes:

- OpenAI Responses API;
- rotinas locais dos modulos Cashback, Cotacao, Financeiro e Tarefas;
- futuro Google Sheets para Cotacao.

## Regras de negocio que precisam ser preservadas

- Miauby nao deve ter acesso livre para executar SQL arbitrario.
- Toda escrita importante deve passar por ferramenta controlada, validada e auditavel.
- Memorias e padroes nao podem armazenar senhas, tokens, chaves, CPF/telefone sem necessidade ou dados sensiveis em texto solto.
- Respostas generativas devem separar fato real, inferencia e proximo passo.
- A autonomia deve ser gradual: primeiro diagnosticar, depois sugerir, depois executar apenas acoes pequenas com trilha de auditoria.
- Cotacao + Sheets precisa de IDs estaveis e controle de conflito antes de qualquer automacao generativa de sync.

## Decisoes tecnicas recomendadas

- Criar um registro formal de skills com nome, modulo, permissao exigida, schema de entrada, schema de saida, risco e funcao PHP executora.
- Separar skills em tres niveis:
  - leitura: consulta dados e gera resumo;
  - sugestao: detecta padroes e propoe proximo passo;
  - escrita: altera dados somente com validacao e auditoria.
- Criar uma camada `miauw_skill_registry()` antes de adicionar novas tools soltas.
- Criar avaliacao simples de skills: exemplos de entrada, saida esperada e casos proibidos.
- Usar `miauw_padroes` como memoria operacional resumida, nao como caixa de texto infinito.
- Criar tela de diagnostico do Miauby mostrando API, modelo, skills ativas, ultimos alertas, ultimos padroes e falhas recentes.

## Riscos ao alterar

- Adicionar tool generativa sem schema pode criar escrita indevida no banco.
- Aprendizado automatico sem filtro pode cristalizar erro operacional.
- Respostas longas demais no widget podem atrapalhar fluxo do funcionario.
- Aumentar contexto demais pode elevar custo e lentidao.
- Misturar comandos de financeiro, cotacao e cashback pode registrar dado no modulo errado.

## Pendencias

- Mapear todas as tools atuais de `miauw_openai_tools()`.
- Criar `miauw_skill_registry()` com metadados e permissao.
- Criar logs estruturados para execucao de skill.
- Criar testes de exemplos para intents de financeiro, cotacao, tarefa e alertas.
- Definir tela administrativa para revisar memorias e padroes aprendidos.
- Definir quando Miauby pode executar escrita automaticamente e quando precisa pedir confirmacao.

## Como pode evoluir

- Fase 1: documentar tools atuais e criar registry sem mudar comportamento.
- Fase 2: adicionar testes de intents e respostas proibidas.
- Fase 3: criar painel de diagnostico e revisao de memoria/padroes.
- Fase 4: transformar padroes recorrentes em sugestoes de melhoria de processo.
- Fase 5: integrar Cotacao + Google Sheets com auditoria e usar Miauby para resumir divergencias.
