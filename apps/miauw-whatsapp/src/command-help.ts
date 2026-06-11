export type WhatsappCommandHelpAction = {
  label: string;
  example: string;
  note?: string;
};

export type WhatsappCommandHelpCategory = {
  moduleKey: string;
  title: string;
  actions: WhatsappCommandHelpAction[];
};

export type WhatsappCommandHelpAutomation = {
  title: string;
  schedule: string;
  moduleTitle: string;
  recipients: string[];
  status?: string;
};

export type WhatsappCommandHelpOptions = {
  automations?: WhatsappCommandHelpAutomation[];
};

export const WHATSAPP_MISSING_PREFIX_HELP_REPLY = '😺 Para acessar o Miauby é só digitar Miauby e seu comando! ✨';

export const WHATSAPP_COMMAND_HELP_REGISTRY: WhatsappCommandHelpCategory[] = [
  {
    moduleKey: 'financeiro',
    title: 'Financeiro (card)',
    actions: [
      { label: 'Sangria', example: 'miauby sangria 10 troco' },
      { label: 'PIX CNPJ manual', example: 'miauby pix cnpj 28,90 Sueli' },
      { label: 'Comprovante PIX foto/PDF', example: 'envie o comprovante Pix', note: 'leitura segura; se falhar, pede o comando manual' },
    ],
  },
  {
    moduleKey: 'pedidos',
    title: 'Pedidos (card)',
    actions: [
      { label: 'Ver pedidos aguardando', example: 'miauby pedidos' },
      { label: 'Criar pedido', example: 'miauby pedido ANB 350' },
      { label: 'Criar pedido parcelado', example: 'miauby pedido ANB 2 parcelas 200 10/06 e 150 20/06' },
      { label: 'Cancelar pedido', example: 'miauby cancelar pedido ANB' },
      { label: 'Confirmar chegada depois do alerta', example: 'miauby cimed chegou' },
    ],
  },
  {
    moduleKey: 'cotacao',
    title: 'Cotacao (card)',
    actions: [
      { label: 'Ver encomendas ativas', example: 'miauby encomendas' },
      { label: 'Ver encomendas antigas', example: 'miauby encomendas antigas' },
      { label: 'Ver encomendas recentes', example: 'miauby encomendas recentes' },
    ],
  },
  {
    moduleKey: 'tarefas',
    title: 'Tarefas (card)',
    actions: [
      { label: 'Ver tarefas', example: 'miauby tarefas' },
      { label: 'Consultar tarefa especifica', example: 'miauby tarefa conferir pedido' },
      { label: 'Criar tarefa para pessoa', example: 'miauby tarefa para Thiago conferir pedido' },
      { label: 'Criar tarefa geral', example: 'miauby tarefa geral limpar balcao' },
      { label: 'Concluir tarefa', example: 'miauby concluir tarefa conferir pedido' },
      { label: 'Cancelar tarefa', example: 'miauby cancelar tarefa conferir pedido' },
    ],
  },
  {
    moduleKey: 'miauw',
    title: 'Miauby / n8n (card)',
    actions: [
      { label: 'Ver cards liberados', example: 'miauby menu' },
      { label: 'Ver avisos n8n enviados para usuarios', example: 'miauby n8n' },
    ],
  },
];

export function formatWhatsappCommandHelp(allowedModuleKeys: Iterable<string>, options: WhatsappCommandHelpOptions = {}): string {
  const allowed = new Set(Array.from(allowedModuleKeys, (key) => key.toLowerCase()));
  const categories = WHATSAPP_COMMAND_HELP_REGISTRY.filter((category) => allowed.has(category.moduleKey));
  const automations = (options.automations || []).filter((automation) => automation.title && automation.schedule);

  if (!categories.length) {
    return [
      'Miauww 😼 Como posso te ajudar hoje?',
      '',
      'Seu numero esta autorizado, mas nenhum card liberado agora tem acao Whats confirmada neste menu.',
      '',
      'Use *miauby menu* para ver seus cards liberados.',
    ].join('\n');
  }

  const lines = [
    'Miauww 😼 *Acoes ativas do Miauby Whats*',
    '',
    'Texto sem *miauby* mostra este menu e nao executa acao.',
    'Para texto operacional, use *miauby* no comeco. Para comprovante, envie a foto/PDF.',
    '',
  ];

  for (const [index, category] of categories.entries()) {
    lines.push(`*${index + 1}. ${category.title}*`);
    for (const action of category.actions) {
      lines.push(`- *${action.label}* - exemplo: _${action.example}_`);
      if (action.note) lines.push(`  Obs: ${action.note}.`);
    }
    lines.push('');
  }

  if (automations.length) {
    lines.push('*N8n / avisos enviados*');
    lines.push('Somente rotinas que podem mandar WhatsApp para usuarios autorizados.');
    for (const automation of automations) {
      const recipients = automation.recipients.length ? automation.recipients.join(', ') : 'nenhum usuario liberado agora';
      lines.push(`- *${automation.title}* - _${automation.schedule}_ - Card: ${automation.moduleTitle}`);
      lines.push(`  Vai para: ${recipients}`);
    }
    lines.push('');
  }

  lines.push('Digite o comando com *miauby* no comeco.');
  return lines.join('\n').trim();
}
