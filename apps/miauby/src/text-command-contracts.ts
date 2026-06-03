export type TextCommandOrigin = 'miauby_interno' | 'miauby_whatsapp';

export type TextCommandContract = {
  intent: string;
  title: string;
  module: string;
  tool: string;
  risk: 'baixo' | 'medio' | 'alto';
  origins: TextCommandOrigin[];
  internal_requires_prefix: boolean;
  whatsapp_requires_prefix: boolean;
  internal_supports_media: boolean;
  whatsapp_supports_media: boolean;
  required_fields: string[];
  optional_fields: string[];
  internal_examples: string[];
  whatsapp_examples: string[];
  missing_data_replies: string[];
  ambiguity_rules: string[];
  response_examples: string[];
  notes: string[];
  keywords: string[];
};

const identityResolution = {
  miauby_interno: {
    responsible_source: 'session',
    default_origin: 'miauby_interno',
    requires_valid_session: true,
    missing_identity_reply: 'Sessao expirada. Entre de novo para o Miauby continuar.',
    manual_responsible_policy: 'usuario comum nao executa em nome de outro; admin pode informar outro responsavel somente quando a regra do modulo permitir',
    history_fields: ['user_id', 'display_name', 'username', 'origin'],
  },
  miauby_whatsapp: {
    responsible_source: 'whatsapp_link',
    default_origin: 'miauby_whatsapp',
    requires_allowlist: true,
    missing_identity_reply: 'Responsavel nao identificado. Vincule esse numero a um usuario antes de gravar.',
    manual_responsible_policy: 'numero vinculado vence como responsavel oficial; nome digitado diferente fica em auditoria/observacao salvo permissao valida',
    history_fields: ['user_id', 'display_name', 'username', 'origin', 'contact_mask'],
  },
} as const;

const textCommandContracts: TextCommandContract[] = [
  {
    intent: 'registrar_sangria',
    title: 'Registrar sangria',
    module: 'financeiro',
    tool: 'registrar_sangria',
    risk: 'alto',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['valor', 'responsavel_identificado'],
    optional_fields: ['observacao', 'horario_referencia'],
    internal_examples: [
      'sangria 10 troco',
      'lancar sangria 25 mercado',
      'tira 20 do caixa para cafe',
      'sangria 50 sueli compra de agua',
    ],
    whatsapp_examples: [
      'miauby sangria 10 troco',
      'miauby sangria 50 sueli compra de agua',
      'miauby retirei 15 do caixa',
    ],
    missing_data_replies: [
      'Faltou o valor. Me mande assim: sangria 10 troco.',
      'Nao entendi o valor. Me mande assim: sangria 10.',
    ],
    ambiguity_rules: [
      'usar usuario logado como responsavel padrao no interno',
      'usar usuario vinculado ao numero como responsavel padrao no WhatsApp',
      'usuario comum nao registra sangria em nome de outro sem permissao',
      'nao registrar valor zerado, negativo ou confuso',
      'valor muito alto pede confirmacao antes de gravar',
    ],
    response_examples: [
      'Sangria registrada: R$ 10,00 - Will - troco.',
      'Faltou o valor. Me mande assim: sangria 10 troco.',
    ],
    notes: [
      'texto restante depois de valor/responsavel vira observacao',
      'no interno, nao pedir o nome do proprio usuario quando a sessao ja identificou',
      'origem deve ser miauby_interno ou miauby_whatsapp',
    ],
    keywords: ['sangria', 'sangra', 'retirei', 'retirada', 'caixa', 'tirar', 'sangrei'],
  },
  {
    intent: 'registrar_pix_cnpj',
    title: 'Registrar PIX CNPJ',
    module: 'financeiro',
    tool: 'criar_lancamento_financeiro',
    risk: 'alto',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: true,
    required_fields: ['valor', 'responsavel_identificado'],
    optional_fields: ['observacao', 'destino', 'pagador', 'data_hora'],
    internal_examples: [
      'pix cnpj 28,90 compra fornecedor',
      'lancar pix cnpj 28,90 compra fornecedor',
      'registrar pix cnpj valor 28,90 observacao compra urgente',
      'pix cnpj 28,90 sueli compra fornecedor',
    ],
    whatsapp_examples: [
      'miauby pix cnpj 28,90 sueli',
      'miauby pix cnpj valor 28,90 responsavel sueli',
      'miauby pix cnpj sueli 28,90',
      'foto/PDF de comprovante Pix, quando OCR estiver habilitado',
    ],
    missing_data_replies: [
      'Faltou o valor. Me mande assim: pix cnpj 28,90 compra fornecedor.',
      'Responsavel nao identificado. Entre de novo ou confirme o usuario antes de gravar.',
    ],
    ambiguity_rules: [
      'Miauby interno trabalha somente com texto manual, sem OCR de imagem/PDF',
      'Miauby interno usa a sessao como responsavel padrao; nao exigir nome proprio no comando',
      'nome digitado diferente do usuario logado precisa permissao antes de virar responsavel',
      'WhatsApp pode tentar OCR de midia; se falhar, pede comando textual curto',
      'nao inventar dado de comprovante ilegivel',
      'nao registrar sem valor e responsavel',
    ],
    response_examples: [
      'PIX CNPJ lancado: R$ 28,90 - Sueli.',
      'PIX CNPJ lancado: R$ 28,90 - Sueli - compra fornecedor.',
    ],
    notes: [
      'texto manual e a base de aprendizado compartilhada com o interno',
      'no interno, observacao pode vir logo depois do valor porque o responsavel ja vem da sessao',
      'detalhes completos de midia ficam so em log/historico do WhatsApp',
    ],
    keywords: ['pix', 'cnpj', 'cpnj', 'comprovante', 'responsavel', 'valor'],
  },
  {
    intent: 'criar_pedido',
    title: 'Criar pedido',
    module: 'pedidos',
    tool: 'criar_pedido',
    risk: 'alto',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['fornecedor', 'valor'],
    optional_fields: ['parcelas', 'vencimento', 'previsao_chegada', 'status_inicial', 'observacao'],
    internal_examples: [
      'pedido anb 350',
      'registrar pedido nissei 280 vence 10/06',
      'pedido anb 350 em 2 parcelas',
      'pedido nissei 100 chegou e pago',
    ],
    whatsapp_examples: [
      'miauby pedido anb 350',
      'miauby distribuidora anb 350',
      'miauby pedido nissei 100 chegou e pago',
    ],
    missing_data_replies: [
      'Faltou fornecedor e valor. Me mande assim: pedido anb 350.',
      'Faltou o valor. Me mande assim: pedido anb 350.',
    ],
    ambiguity_rules: [
      'status contraditorio nao grava',
      'soma de parcelas diferente do total pede confirmacao',
      'data passada pede correcao no painel ou ano claro',
    ],
    response_examples: [
      'Pedido criado: ANB - R$ 350,00.',
      'Pedido parcelado criado: ANB - 2 parcelas - R$ 350,00.',
    ],
    notes: [
      'usar endpoint oficial de Pedidos; nao criar registro paralelo',
      'origem deve ser registrada conforme canal',
    ],
    keywords: ['pedido', 'pedidos', 'fornecedor', 'distribuidora', 'boleto', 'parcela', 'chegou'],
  },
  {
    intent: 'listar_tarefas',
    title: 'Listar tarefas',
    module: 'tarefa',
    tool: 'listar_tarefas_usuario',
    risk: 'baixo',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['responsavel_identificado'],
    optional_fields: ['filtro_texto'],
    internal_examples: [
      'tarefas',
      'minhas tarefas',
      'o que preciso fazer',
      'lista minhas tarefas',
    ],
    whatsapp_examples: [
      'miauby tarefas',
      'miauby minhas tarefas',
      'miauby o que preciso fazer',
    ],
    missing_data_replies: ['Sessao expirada. Entre no sistema antes de consultar tarefas.'],
    ambiguity_rules: [
      'usuario comum ve somente tarefas gerais e privadas dele',
      'ADM pode ver tarefas privadas separadas por usuario',
    ],
    response_examples: ['Tarefas do ADM para voce: 1. Conferir caixa.'],
    notes: ['consulta usa app Tarefa Node/Postgres; nao consulta wf_tarefas legado'],
    keywords: ['tarefa', 'tarefas', 'minhas tarefas', 'pendente'],
  },
  {
    intent: 'consultar_tarefa',
    title: 'Consultar tarefa especifica',
    module: 'tarefa',
    tool: 'consultar_tarefa',
    risk: 'baixo',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['responsavel_identificado', 'texto_da_tarefa'],
    optional_fields: ['task_id'],
    internal_examples: ['consultar tarefa conferir pedido', 'mostrar tarefa da Nissei', 'status da tarefa encomenda'],
    whatsapp_examples: ['miauby consultar tarefa conferir pedido', 'miauby mostrar tarefa da Nissei', 'miauby status da tarefa encomenda'],
    missing_data_replies: ['Qual tarefa voce quer consultar?'],
    ambiguity_rules: [
      'consultar apenas tarefas abertas visiveis para o usuario',
      'se houver mais de uma tarefa parecida, listar por grupo e pedir numero ou texto',
      'consulta nao altera status nem pede confirmacao de gravacao',
    ],
    response_examples: ['Achei mais de uma tarefa parecida. Qual deseja consultar?', 'Tarefa: Conferir pedido da Nissei'],
    notes: ['consulta especifica usa a mesma busca visivel de concluir/cancelar, sem alterar status'],
    keywords: ['consultar tarefa', 'mostrar tarefa', 'status tarefa'],
  },
  {
    intent: 'criar_tarefa',
    title: 'Criar tarefa',
    module: 'tarefa',
    tool: 'criar_tarefa',
    risk: 'medio',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['titulo'],
    optional_fields: ['descricao', 'prioridade', 'usuario_destino', 'lembrete'],
    internal_examples: [
      'criar tarefa conferir caixa',
      'tarefa pra mim organizar balcao',
      'me lembra de conferir vencidos',
      'tarefa para sueli conferir pendencia do caixa',
      'tarefa para thiago conferir pedidos amanha 15h',
      'me lembra de conferir vencidos sexta cedo',
      'tarefa geral limpar balcao',
    ],
    whatsapp_examples: [
      'miauby criar tarefa conferir caixa',
      'miauby tarefa pra mim organizar balcao',
      'miauby tarefa para sueli conferir pendencia do caixa',
      'miauby tarefa para thiago conferir pedidos amanha 15h',
      'miauby me lembra de conferir vencidos sexta cedo',
      'miauby tarefa geral limpar balcao',
    ],
    missing_data_replies: ['Faltou o titulo da tarefa. Me mande assim: tarefa conferir caixa.'],
    ambiguity_rules: [
      'usuario comum cria tarefa privada para si mesmo por padrao',
      'usuario comum nao cria tarefa geral e nao cria para outro usuario',
      'ADM/admin pode criar tarefa privada para outro usuario ou tarefa geral',
      'tarefa privada precisa usuario de destino valido',
      'lembrete automatico respeita ferias e allowlist',
      'data/hora simples vira remind_at apenas quando existe usuario privado de destino',
    ],
    response_examples: ['Tarefa criada para voce: conferir caixa.', 'Tarefa criada para Thiago: conferir pedidos.', 'Tarefa geral criada: limpar balcao.'],
    notes: ['escrita de baixo risco continua auditada pelo modulo Tarefa; usar usuario logado/numero vinculado como ator'],
    keywords: ['tarefa', 'lembrete', 'conferir', 'prioridade', 'amanha'],
  },
  {
    intent: 'concluir_tarefa',
    title: 'Concluir tarefa',
    module: 'tarefa',
    tool: 'concluir_tarefa',
    risk: 'medio',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['responsavel_identificado', 'texto_da_tarefa'],
    optional_fields: ['task_id'],
    internal_examples: ['terminei a tarefa conferir caixa', 'conclui conferir pedidos', 'ja fiz a tarefa dos distribuidores'],
    whatsapp_examples: ['miauby terminei a tarefa conferir caixa', 'miauby ja fiz a tarefa dos distribuidores'],
    missing_data_replies: ['Qual tarefa voce concluiu?'],
    ambiguity_rules: [
      'procurar apenas tarefas abertas visiveis para o usuario',
      'mais de uma tarefa parecida lista grupos e pede escolha por numero, ordinal, grupo ou trecho do titulo',
      'aceitar respostas como 1, a segunda, a geral, adm 1, minha 2, a da Nissei',
      'uma tarefa clara pede confirmacao antes de concluir',
    ],
    response_examples: ['Achei mais de uma tarefa parecida. Qual deseja concluir?', 'Confirma concluir: "Trocar todos os distribuidores"?', 'Tarefa concluida: Trocar todos os distribuidores 😼'],
    notes: ['status muda somente pelo endpoint interno do app Tarefa com auditoria'],
    keywords: ['concluir', 'terminei', 'feito', 'finalizar tarefa'],
  },
  {
    intent: 'cancelar_tarefa',
    title: 'Cancelar tarefa',
    module: 'tarefa',
    tool: 'cancelar_tarefa',
    risk: 'medio',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['responsavel_identificado', 'texto_da_tarefa'],
    optional_fields: ['task_id'],
    internal_examples: ['cancelar tarefa conferir caixa', 'nao preciso mais da tarefa organizar balcao'],
    whatsapp_examples: ['miauby cancelar tarefa conferir caixa', 'miauby nao preciso mais da tarefa organizar balcao'],
    missing_data_replies: ['Qual tarefa voce quer cancelar?'],
    ambiguity_rules: [
      'usuario comum nao cancela tarefa criada pelo ADM para ele',
      'ADM/admin pode cancelar conforme regra do app Tarefa',
      'mais de uma tarefa parecida lista grupos e pede escolha antes de confirmar',
      'aceitar cancela como confirmacao quando a pergunta for Confirma cancelar; aceitar nao cancela/cancela comando como desistir',
      'uma tarefa clara pede confirmacao antes de cancelar',
    ],
    response_examples: ['Confirma cancelar: "Conferir caixa"?', 'Tarefa cancelada: Conferir caixa.'],
    notes: ['cancelamento nao apaga tarefa; move para historico auditado'],
    keywords: ['cancelar tarefa', 'excluir tarefa', 'nao preciso mais'],
  },
  {
    intent: 'consultar_cotacao',
    title: 'Consultar cotacao',
    module: 'cotacao',
    tool: 'buscar_cotacao',
    risk: 'baixo',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['busca'],
    optional_fields: ['categoria', 'ean', 'fornecedor'],
    internal_examples: ['cotacao dipirona', 'buscar cotacao pelo ean 789...', 'ver urgentes da cotacao'],
    whatsapp_examples: ['miauby cotacao dipirona', 'miauby buscar cotacao dipirona'],
    missing_data_replies: ['Faltou o item. Me mande assim: cotacao dipirona.'],
    ambiguity_rules: ['consulta nao inventa preco ou fornecedor sem dado do backend'],
    response_examples: ['Achei na Cotacao: dipirona - confira fornecedor/preco no modulo.'],
    notes: ['consultas sao leitura; encomenda/urgente sao intents separadas com escrita e confirmacao'],
    keywords: ['cotacao', 'cotar', 'preco', 'ean', 'urgente', 'encomenda'],
  },
  {
    intent: 'fechamento_caixa',
    title: 'Fechamento de caixa',
    module: 'financeiro',
    tool: 'resumo_financeiro',
    risk: 'medio',
    origins: ['miauby_interno', 'miauby_whatsapp'],
    internal_requires_prefix: false,
    whatsapp_requires_prefix: true,
    internal_supports_media: false,
    whatsapp_supports_media: false,
    required_fields: ['acao_ou_data'],
    optional_fields: ['status', 'observacao'],
    internal_examples: ['caixa de hoje esta aberto?', 'fechar caixa de hoje', 'abrir caixa novamente'],
    whatsapp_examples: ['miauby caixa de hoje esta aberto?', 'miauby fechamento de caixa'],
    missing_data_replies: ['Me diga se quer consultar, fechar ou reabrir o caixa.'],
    ambiguity_rules: [
      'consulta pode responder com dado real',
      'fechar/reabrir e acao forte e precisa permissao/confirmacao conforme modulo Financeiro',
    ],
    response_examples: ['Caixa de hoje ainda esta aberto. Abra o Financeiro e finalize.'],
    notes: ['automacoes n8n usam resumo curto e um caixa por linha no WhatsApp'],
    keywords: ['caixa', 'fechamento', 'fechar', 'reabrir', 'aberto', 'conferencia'],
  },
];

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreContract(message: string, contract: TextCommandContract): number {
  const normalized = normalizeSearch(message);
  if (!normalized) return 0;
  const anchorHaystack = normalizeSearch([
    contract.intent,
    contract.title,
    contract.module,
    contract.tool,
    ...contract.keywords,
  ].join(' '));
  const words = normalized.split(/\s+/g).filter((item) => item.length >= 3);
  const hasAnchor = words.some((word) => anchorHaystack.includes(word)) || anchorHaystack.includes(normalized);
  if (!hasAnchor) return 0;

  const haystack = normalizeSearch([
    anchorHaystack,
    ...contract.internal_examples,
    ...contract.whatsapp_examples,
  ].join(' '));
  let score = haystack.includes(normalized) ? 80 : 0;
  for (const word of words) {
    if (haystack.includes(word)) score += 10;
  }
  return score;
}

function trainingLine(contract: TextCommandContract, origin: TextCommandOrigin): string {
  const fields = contract.required_fields.join(', ');
  const internalExample = contract.internal_examples[0] || contract.intent;
  const reply = contract.response_examples[0] || 'resposta curta operacional.';
  const identityRule = origin === 'miauby_whatsapp'
    ? 'responsavel=usuario_vinculado_ao_numero'
    : 'responsavel=usuario_logado_da_sessao';

  return `${contract.intent}: no interno aceite "${internalExample}" sem prefixo; campos=${fields}; ${identityRule}; origem=${origin}; resposta="${reply}"`;
}

export function buildTextCommandContracts(options: { message?: string; origin?: TextCommandOrigin; limit?: number } = {}) {
  const origin = options.origin || 'miauby_interno';
  const message = options.message || '';
  const limit = Math.max(1, Math.min(12, Math.trunc(options.limit || 8)));
  const scored = textCommandContracts
    .filter((contract) => contract.origins.includes(origin) || contract.origins.includes('miauby_interno'))
    .map((contract) => ({ contract, score: scoreContract(message, contract) }));

  scored.sort((left, right) => right.score - left.score || left.contract.intent.localeCompare(right.contract.intent));
  const selected = (message.trim() ? scored.filter((item) => item.score >= 20) : scored).slice(0, limit);
  const fallback = selected.length > 0 ? selected : scored.slice(0, limit);

  return {
    version: 'miauby-text-command-contracts-2026-06-03-tarefas',
    source: 'apps/miauby/src/text-command-contracts.ts',
    mode: 'text_only_shared_training',
    origin,
    whatsapp_requires_prefix: true,
    internal_requires_prefix: false,
    internal_supports_media: false,
    writes_enabled_in_node: false,
    execution_owner: 'php_or_module_endpoint',
    confirmation_owner: 'php_or_module_endpoint',
    identity_resolution: identityResolution,
    summary: {
      total: textCommandContracts.length,
      selected: fallback.length,
      media_commands_for_internal: 0,
    },
    rules: [
      'todo comando textual criado no WhatsApp deve ganhar variacoes textuais no Miauby interno quando fizer sentido',
      'Miauby interno aceita comando direto, sem exigir a palavra miauby',
      'Miauby interno usa o usuario logado da sessao como responsavel padrao',
      'sem sessao valida no Miauby interno, nao executar comando e pedir login',
      'Miauby WhatsApp usa o usuario vinculado ao numero/allowlist como responsavel padrao',
      'usuario comum nao registra acao em nome de outro sem permissao',
      'Miauby interno nao le imagem, foto, PDF, audio ou comprovante; usa somente fallback textual/manual',
      'origem precisa ser registrada como miauby_interno ou miauby_whatsapp',
      'resposta publica fica curta; detalhes completos ficam em historico/log',
    ],
    training_lines: fallback.map((item) => trainingLine(item.contract, origin)),
    commands: fallback.map((item) => ({
      ...item.contract,
      score: item.score,
      selected_for_message: item.score > 0,
    })),
  };
}
