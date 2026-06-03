import crypto from 'node:crypto';

export type JsonSchema = Record<string, unknown>;

export type ToolContract = {
  name: string;
  title: string;
  module: string;
  level: 'leitura' | 'escrita' | 'diagnostico' | 'sugestao';
  risk: 'baixo' | 'medio' | 'alto';
  permission: string;
  openaiTool: boolean;
  localAction: boolean;
  description: string;
  parameters: JsonSchema;
  required: string[];
  effects: string[];
  audit: string[];
};

export type ToolContractFilters = {
  name?: string;
  module?: string;
  risk?: string;
};

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const monthYearSchema = objectSchema(
  {
    mes: { type: 'integer', minimum: 1, maximum: 12 },
    ano: { type: 'integer', minimum: 2020, maximum: 2035 },
  },
  ['mes', 'ano'],
);

const optionalMonthYearSchema = objectSchema({
  mes: { type: 'integer', minimum: 1, maximum: 12 },
  ano: { type: 'integer', minimum: 2020, maximum: 2035 },
});

const toolContracts: ToolContract[] = [
  {
    name: 'resumo_financeiro',
    title: 'Resumo financeiro',
    module: 'financeiro',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Consulta resumo financeiro por mes e ano: fechamentos, totais, total sistema, sobra/falta e categorias.',
    parameters: monthYearSchema,
    required: ['mes', 'ano'],
    effects: [],
    audit: [],
  },
  {
    name: 'resumo_cashback',
    title: 'Resumo cashback',
    module: 'cashback',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Consulta resumo de compras, cashback, resgates e saldo ativo por mes e ano.',
    parameters: monthYearSchema,
    required: ['mes', 'ano'],
    effects: [],
    audit: [],
  },
  {
    name: 'resumo_codigos',
    title: 'Resumo codigos',
    module: 'codigos',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Consulta resumo dos atalhos de codigos de comissao, separados por blocos de EAN.',
    parameters: optionalMonthYearSchema,
    required: [],
    effects: [],
    audit: [],
  },
  {
    name: 'resumo_gestao',
    title: 'Resumo Gestao',
    module: 'gestao',
    level: 'leitura',
    risk: 'baixo',
    permission: 'adm_gerente',
    openaiTool: true,
    localAction: false,
    description: 'Consulta resumo da Gestao administrativa: contas a pagar, pendencias e categorias por mes e ano.',
    parameters: monthYearSchema,
    required: ['mes', 'ano'],
    effects: [],
    audit: [],
  },
  {
    name: 'buscar_cliente',
    title: 'Buscar cliente',
    module: 'cashback',
    level: 'leitura',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Busca cliente por nome ou telefone parcial no cashback, sem expor telefone completo.',
    parameters: objectSchema({ busca: { type: 'string', minLength: 3, maxLength: 80 } }, ['busca']),
    required: ['busca'],
    effects: ['nao_expor_telefone_completo'],
    audit: [],
  },
  {
    name: 'buscar_codigo_comissao',
    title: 'Buscar codigo de comissao',
    module: 'codigos',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Busca atalho em Codigos por codigo, EAN ou nome do item, retornando preco de comissao.',
    parameters: objectSchema({ busca: { type: 'string', minLength: 2, maxLength: 120 } }, ['busca']),
    required: ['busca'],
    effects: [],
    audit: [],
  },
  {
    name: 'buscar_cotacao',
    title: 'Buscar cotacao',
    module: 'cotacao',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Busca item de cotacao por EAN, produto ou categoria.',
    parameters: objectSchema({ busca: { type: 'string', minLength: 2, maxLength: 120 } }, ['busca']),
    required: ['busca'],
    effects: [],
    audit: [],
  },
  {
    name: 'farmacia_popular_valor',
    title: 'Farmacia Popular',
    module: 'farmacia_popular',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Consulta valor de referencia/reembolso do Programa Farmacia Popular por produto, principio ativo ou apresentacao. Padrao da Wimifarma: UF PR.',
    parameters: objectSchema(
      {
        produto: { type: 'string', minLength: 2, maxLength: 140 },
        uf: { type: 'string', minLength: 2, maxLength: 2, description: 'UF brasileira. Use PR se o usuario nao pedir outra.' },
      },
      ['produto'],
    ),
    required: ['produto'],
    effects: ['nao_substitui_conferencia_oficial'],
    audit: [],
  },
  {
    name: 'pesquisa_web_referencias',
    title: 'Pesquisa web controlada',
    module: 'externo',
    level: 'leitura',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Pesquisa referencias externas e devolve titulo, trecho e link. Nao use para dados internos da Wimifarma.',
    parameters: objectSchema(
      {
        consulta: { type: 'string', minLength: 3, maxLength: 180 },
        limite: { type: 'integer', minimum: 1, maximum: 6 },
      },
      ['consulta'],
    ),
    required: ['consulta'],
    effects: ['citar_fontes', 'nao_transformar_snippet_em_verdade'],
    audit: [],
  },
  {
    name: 'noticias_medicamentos_oficiais',
    title: 'Noticias oficiais de medicamentos',
    module: 'externo',
    level: 'leitura',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Busca noticias e comunicados oficiais recentes sobre medicamentos em fontes oficiais.',
    parameters: objectSchema({ limite: { type: 'integer', minimum: 1, maximum: 5 } }),
    required: [],
    effects: ['sem_orientacao_clinica'],
    audit: [],
  },
  {
    name: 'criar_tarefa',
    title: 'Criar tarefa',
    module: 'tarefa',
    level: 'escrita',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: true,
    localAction: true,
    description: 'Cria tarefa interna quando houver titulo claro. Escrita continua pela ponte PHP auditada.',
    parameters: objectSchema(
      {
        titulo: { type: 'string', minLength: 2, maxLength: 180 },
        descricao: { type: 'string', maxLength: 900 },
        prioridade: { type: 'string', enum: ['alta', 'normal', 'baixa'] },
      },
      ['titulo'],
    ),
    required: ['titulo'],
    effects: ['cria_registro'],
    audit: ['tarefa_tasks', 'tarefa_audit_events', 'core_audit_logs', 'miauw_tool_traces'],
  },
  {
    name: 'listar_tarefas_usuario',
    title: 'Listar tarefas do usuario',
    module: 'tarefa',
    level: 'leitura',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: false,
    localAction: true,
    description: 'Lista tarefas abertas que o usuario identificado pode ver, separando ADM para voce, minhas tarefas e gerais.',
    parameters: objectSchema({
      actor_user_id: { type: 'integer', minimum: 1 },
      filtro: { type: 'string', maxLength: 160 },
    }),
    required: ['actor_user_id'],
    effects: ['consulta_dados'],
    audit: ['tarefa_tasks', 'miauw_tool_traces'],
  },
  {
    name: 'concluir_tarefa',
    title: 'Concluir tarefa',
    module: 'tarefa',
    level: 'escrita',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: false,
    localAction: true,
    description: 'Conclui tarefa aberta visivel para o usuario depois de confirmacao humana.',
    parameters: objectSchema(
      {
        task_id: { type: 'integer', minimum: 1 },
        actor_user_id: { type: 'integer', minimum: 1 },
      },
      ['task_id', 'actor_user_id'],
    ),
    required: ['task_id', 'actor_user_id'],
    effects: ['altera_status', 'exige_confirmacao'],
    audit: ['tarefa_tasks', 'tarefa_audit_events', 'core_audit_logs', 'miauw_tool_traces'],
  },
  {
    name: 'cancelar_tarefa',
    title: 'Cancelar tarefa',
    module: 'tarefa',
    level: 'escrita',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: false,
    localAction: true,
    description: 'Cancela tarefa aberta permitida para o usuario depois de confirmacao humana; nao apaga dados.',
    parameters: objectSchema(
      {
        task_id: { type: 'integer', minimum: 1 },
        actor_user_id: { type: 'integer', minimum: 1 },
      },
      ['task_id', 'actor_user_id'],
    ),
    required: ['task_id', 'actor_user_id'],
    effects: ['altera_status', 'exige_confirmacao'],
    audit: ['tarefa_tasks', 'tarefa_audit_events', 'core_audit_logs', 'miauw_tool_traces'],
  },
  {
    name: 'criar_encomenda_cotacao',
    title: 'Criar encomenda na cotacao',
    module: 'cotacao',
    level: 'escrita',
    risk: 'alto',
    permission: 'autenticado',
    openaiTool: true,
    localAction: true,
    description: 'Cria item de encomenda na Cotacao Geral apenas apos confirmacao humana.',
    parameters: objectSchema(
      {
        produto: { type: 'string', minLength: 2, maxLength: 160 },
        responsavel: { type: 'string', minLength: 2, maxLength: 100 },
        observacao: { type: 'string', maxLength: 260 },
      },
      ['produto', 'responsavel'],
    ),
    required: ['produto', 'responsavel'],
    effects: ['cria_item_cotacao_v2', 'exige_confirmacao'],
    audit: ['cotacao_v2_rows', 'cotacao_v2_events', 'miauw_tool_traces'],
  },
  {
    name: 'criar_conta_gestao',
    title: 'Criar conta na Gestao',
    module: 'gestao',
    level: 'escrita',
    risk: 'alto',
    permission: 'adm_gerente',
    openaiTool: true,
    localAction: true,
    description: 'Cria conta na Gestao somente apos confirmacao humana.',
    parameters: objectSchema(
      {
        titulo: { type: 'string', minLength: 2, maxLength: 160 },
        valor: { type: 'number', minimum: 0.01 },
        categoria: { type: 'string', minLength: 2, maxLength: 80 },
        competencia_mes: { type: 'string', maxLength: 7 },
        vencimento_em: { type: 'string', maxLength: 10 },
        observacao: { type: 'string', maxLength: 260 },
      },
      ['titulo', 'valor', 'categoria'],
    ),
    required: ['titulo', 'valor', 'categoria'],
    effects: ['cria_conta_a_pagar', 'exige_confirmacao'],
    audit: ['gestao_audit_events', 'core_audit_logs', 'miauw_tool_traces'],
  },
  {
    name: 'registrar_sangria',
    title: 'Registrar sangria',
    module: 'financeiro',
    level: 'escrita',
    risk: 'alto',
    permission: 'autenticado',
    openaiTool: true,
    localAction: true,
    description: 'Registra sangria no financeiro somente apos confirmacao humana.',
    parameters: objectSchema(
      {
        valor: { type: 'number', minimum: 0.01 },
        responsavel: { type: 'string', minLength: 2, maxLength: 70 },
        observacao: { type: 'string', maxLength: 220 },
        data: { type: 'string', description: 'Data em YYYY-MM-DD. Se nao houver data clara, use a data de hoje.' },
      },
      ['valor', 'responsavel'],
    ),
    required: ['valor', 'responsavel'],
    effects: ['cria_lancamento_financeiro_sangria', 'exige_confirmacao'],
    audit: ['financeiro_entries', 'financeiro_audit_events', 'core_audit_logs', 'miauw_tool_traces'],
  },
  {
    name: 'mapa_sistema',
    title: 'Mapa do sistema',
    module: 'sistema',
    level: 'diagnostico',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Mapa de telas, rotas, arquivos, endpoints e acoes disponiveis.',
    parameters: objectSchema({}),
    required: [],
    effects: [],
    audit: [],
  },
  {
    name: 'alertas_operacionais',
    title: 'Alertas operacionais',
    module: 'sistema',
    level: 'diagnostico',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Alertas, riscos e pendencias detectados.',
    parameters: objectSchema({
      modulo: { type: 'string', maxLength: 60 },
      forcar_varredura: { type: 'boolean' },
    }),
    required: [],
    effects: ['pode_varrer_alertas'],
    audit: ['miauw_alertas', 'miauw_alerta_eventos'],
  },
  {
    name: 'diagnostico_operacional',
    title: 'Diagnostico operacional',
    module: 'sistema',
    level: 'sugestao',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Validacao de processo com proximos passos.',
    parameters: objectSchema({ modulo: { type: 'string', maxLength: 60 } }),
    required: [],
    effects: ['nao_altera_dados_operacionais'],
    audit: ['miauw_alertas', 'miauw_padroes'],
  },
  {
    name: 'memoria_operacional',
    title: 'Memoria operacional',
    module: 'sistema',
    level: 'leitura',
    risk: 'medio',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Memorias e padroes relevantes para a consulta.',
    parameters: objectSchema({ consulta: { type: 'string', minLength: 2, maxLength: 180 } }, ['consulta']),
    required: ['consulta'],
    effects: ['nao_expor_segredos'],
    audit: ['miauw_memorias', 'miauw_padroes'],
  },
  {
    name: 'diagnostico_skills',
    title: 'Diagnostico de skills',
    module: 'miauby',
    level: 'diagnostico',
    risk: 'baixo',
    permission: 'autenticado',
    openaiTool: true,
    localAction: false,
    description: 'Inventario seguro das skills registradas.',
    parameters: objectSchema({}),
    required: [],
    effects: ['nao_exibe_segredos'],
    audit: [],
  },
  {
    name: 'criar_lancamento_financeiro',
    title: 'Criar lancamento financeiro',
    module: 'financeiro',
    level: 'escrita',
    risk: 'alto',
    permission: 'autenticado',
    openaiTool: true,
    localAction: true,
    description: 'Cria lancamento financeiro controlado somente apos confirmacao humana quando a acao for forte.',
    parameters: objectSchema(
      {
        categoria: { type: 'string', minLength: 2, maxLength: 80 },
        valor: { type: 'number', minimum: 0.01 },
        responsavel: { type: 'string', minLength: 2, maxLength: 70 },
        observacao: { type: 'string', maxLength: 220 },
        data: { type: 'string', description: 'Data em YYYY-MM-DD. Se nao houver data clara, use a data de hoje.' },
      },
      ['categoria', 'valor', 'responsavel'],
    ),
    required: ['categoria', 'valor', 'responsavel'],
    effects: ['cria_lancamento_financeiro', 'aprende_padrao_comando', 'exige_confirmacao'],
    audit: ['financeiro_entries', 'financeiro_audit_events', 'core_audit_logs', 'miauw_tool_traces', 'miauw_padroes'],
  },
];

const nodeReadBridgeTools = new Set(['resumo_financeiro', 'resumo_cashback', 'resumo_codigos', 'resumo_gestao', 'buscar_codigo_comissao', 'buscar_cotacao']);
const toolsRequiringConfirmation = new Set([
  'registrar_sangria',
  'criar_lancamento_financeiro',
  'registrar_faturamento_diario',
  'criar_encomenda_cotacao',
  'criar_cotacao_urgente',
  'criar_cotacao_rapida',
  'criar_planilha_cotacao',
  'criar_conta_gestao',
]);

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function requiresConfirmation(contract: ToolContract): boolean {
  return toolsRequiringConfirmation.has(contract.name) || (contract.level === 'escrita' && contract.risk === 'alto');
}

function bridgeMode(contract: ToolContract): string {
  if (requiresConfirmation(contract)) return 'confirmation_required';
  if (contract.name === 'criar_tarefa') return 'execute_low_risk_write';
  if (contract.level === 'diagnostico' || contract.level === 'sugestao') return 'execute_diagnostic';
  return 'execute_read';
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildCanonicalToolContracts(filters: ToolContractFilters = {}) {
  const nameFilter = normalizeSearch(filters.name || '');
  const moduleFilter = normalizeSearch(filters.module || '');
  const riskFilter = normalizeSearch(filters.risk || '');
  const openaiTools = toolContracts.filter((contract) => contract.openaiTool);
  const highRiskWrites = toolContracts.filter((contract) => contract.level === 'escrita' && contract.risk === 'alto' && contract.localAction).length;

  const filtered = openaiTools.filter((contract) => {
    return (
      (nameFilter === '' || normalizeSearch(`${contract.name} ${contract.title}`).includes(nameFilter)) &&
      (moduleFilter === '' || normalizeSearch(contract.module).includes(moduleFilter)) &&
      (riskFilter === '' || normalizeSearch(contract.risk).includes(riskFilter))
    );
  });

  const tools: Record<string, unknown> = {};
  for (const contract of filtered) {
    const confirmation = requiresConfirmation(contract);
    const nodeRead = nodeReadBridgeTools.has(contract.name) && contract.level === 'leitura' && contract.risk === 'baixo' && !contract.localAction;
    tools[contract.name] = {
      name: contract.name,
      title: contract.title,
      module: contract.module,
      level: contract.level,
      risk: contract.risk,
      permission: contract.permission,
      executor_available: false,
      local_action: contract.localAction,
      requires_confirmation: confirmation,
      writes_enabled_in_node: false,
      writes_enabled_via_php_bridge: contract.name === 'criar_tarefa',
      node_read_bridge_enabled: nodeRead,
      node_tool_bridge_enabled: true,
      node_tool_bridge_mode: bridgeMode(contract),
      execution_owner: 'php',
      confirmation_owner: 'php',
      description: contract.description,
      parameters: contract.parameters,
      required: contract.required,
      effects: contract.effects,
      audit: contract.audit,
    };
  }

  const checksum = crypto.createHash('sha256').update(stableJson(tools)).digest('hex');

  return {
    version: 'miauby-node-tool-contracts-2026-06-02',
    agent_version: '2.0-fase21',
    phase: 'node-readonly-context-persona-tools',
    source: 'apps/miauby_node_contract_registry',
    personality_version: 'miauby-persona-2026-05-16',
    writes_enabled_in_node: false,
    execution_owner: 'php',
    confirmation_owner: 'php',
    node_read_bridge_tools: Array.from(nodeReadBridgeTools),
    node_tool_bridge_tools: openaiTools.map((contract) => contract.name).sort(),
    checksum,
    filters: {
      name: filters.name || '',
      module: filters.module || '',
      risk: filters.risk || '',
    },
    summary: {
      registry_total: toolContracts.length,
      openai_tools: openaiTools.length,
      schemas_exported: Object.keys(tools).length,
      missing_schemas: 0,
      schemas_without_registry: 0,
      high_risk_writes: highRiskWrites,
      node_read_bridge_tools: nodeReadBridgeTools.size,
      node_tool_bridge_tools: openaiTools.length,
      php_bridge_write_tools: 1,
    },
    missing_schemas: [],
    schemas_without_registry: [],
    tools,
  };
}
