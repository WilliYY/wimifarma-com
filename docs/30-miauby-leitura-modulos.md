# 30 - Miauby: leitura dos modulos internos

## Objetivo

Registrar quais modulos internos o Miauby consegue consultar, por qual ponte, e como validar a integracao sem expor dados sensiveis nem habilitar escrita real.

Data da auditoria inicial: 2026-06-02.

## Como o Miauby consulta modulos

O caminho oficial do agente Node e:

1. `site/miauw/agent-context.php` exporta contexto, personalidade e contratos de tools para o Node.
2. `apps/miauw-agent` escolhe a tool quando a resposta precisa de dado operacional.
3. `site/miauw/agent-tools.php` executa a tool pelo PHP, com token interno.
4. `site/miauw/miauw-skills.php` chama o endpoint interno do modulo dono.
5. O modulo dono le seu proprio Postgres e devolve um resumo sanitizado.

Regra importante: o Miauby nao deve abrir conexao direta para bancos de outros modulos quando existe endpoint interno. Se a ponte falhar, ele deve responder indisponivel/sem dado, sem cair em MySQL legado.

## Status por modulo

| Modulo | Leitura atual | Ponte usada | Tool do Miauby |
| --- | --- | --- | --- |
| Cotacao | OK | `/cotacao/api/internal/summary` e `/search` | `buscar_cotacao` |
| Financeiro | OK | `/financeiro/api/internal/summary` | `resumo_financeiro` |
| Gestao | OK | `/gestao/api/internal/summary` | `resumo_gestao` |
| Pedidos | OK no endpoint interno | `/pedidos/api/internal/arrival-summary` | ainda sem tool de leitura no contrato do Miauby |
| Tarefas | OK | `/tarefa/api/internal/summary` | sem tool de leitura exportada; existe `criar_tarefa` controlada |
| Cashback | OK | `/cashback/api/internal/summary` e `/clients/search` | `resumo_cashback`, `buscar_cliente` |
| Codigos | OK | `/codigos/api/internal/summary` e `/search` | `resumo_codigos`, `buscar_codigo_comissao` |
| Calendario | OK no endpoint interno | `/calendario/api/internal/summary` | sem tool de leitura no contrato do Miauby |
| XP | Limitado | health/migration-status | sem tool de leitura de dados do XP |
| Usuarios | Limitado por seguranca | health do app Usuarios | sem tool de leitura de dados de usuarios |
| Miauby Whats | OK | `/miauw/whatsapp/internal/integration-status` e `/memory` | sem tool direta; usado como ponte/canal |

## Endpoint interno de status

O endpoint `site/miauw/module-status.php` foi criado para testar todos os modulos acima sem devolver payload bruto.

Rota:

- `GET /miauw/module-status.php`
- `POST /miauw/module-status.php`

Autenticacao:

- `X-Miauw-Agent-Token: <MIAUW_AGENT_INTERNAL_TOKEN>`
- ou `X-Miauw-Internal-Token: <MIAUW_AGENT_INTERNAL_TOKEN>`
- fallback apenas se configurado: `MIAUW_GUARDIAN_TOKEN`

Resposta sanitizada:

- modulo;
- status geral;
- status da leitura;
- se leitura e suportada;
- autenticacao interna OK;
- tempo de resposta;
- ultima consulta;
- ultimo erro sanitizado;
- fonte logica;
- resumo de chaves/contagens;
- tools exportadas para o Node;
- ultimo trace relacionado, quando existir.

O endpoint nao retorna token, URL interna bruta, payload completo, telefone cru, segredo, stack trace, SQL ou dado sensivel.

## Como testar no VPS

Executar no VPS, dentro de `/home/ubuntu/projetos/wimifarma-com`:

```bash
TOKEN="$(docker exec wimifarma-com-web printenv MIAUW_AGENT_INTERNAL_TOKEN)"
curl -fsS -H "X-Miauw-Agent-Token: ${TOKEN}" \
  http://127.0.0.1:3002/miauw/module-status.php
```

Para uma visao rapida com `jq`, quando disponivel:

```bash
TOKEN="$(docker exec wimifarma-com-web printenv MIAUW_AGENT_INTERNAL_TOKEN)"
curl -fsS -H "X-Miauw-Agent-Token: ${TOKEN}" \
  http://127.0.0.1:3002/miauw/module-status.php \
  | jq '.summary, .modules[] | {module, status, read_status, auth_ok, response_time_ms, read_supported}'
```

## Pontos fracos conhecidos

- Pedidos tem endpoint interno funcionando, mas ainda nao tem tool de leitura no contrato do Miauby.
- Calendario tem endpoint interno sanitizado para existencia/status, mas ainda nao tem comando operacional nem tool de leitura de notas.
- Tarefas tem resumo interno funcionando, mas o contrato do Node ainda nao exporta uma tool `resumo_tarefas`.
- XP e Usuarios aparecem como `limited`: health OK, mas sem leitura operacional exposta ao Miauby. Para Usuarios isso e esperado por seguranca; qualquer ampliacao deve ser endpoint minimo, mascarado e auditado.
- Miauby Whats tem status/memoria interna OK, mas nao aparece como tool de leitura; ele funciona como canal e ponte.

## Rastreabilidade

`miauw_tool_traces` registra chamadas da ponte universal. A partir desta etapa, novas chamadas via `miauw_agent_node_tool_bridge_result()` tambem registram o modulo e o risco reais da tool chamada, mantendo o payload sanitizado com o nome da tool.

Isso melhora consultas por modulo sem alterar resposta, permissao, sessao ou escrita oficial.
