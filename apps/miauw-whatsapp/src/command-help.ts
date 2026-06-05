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

export const WHATSAPP_COMMAND_HELP_REGISTRY: WhatsappCommandHelpCategory[] = [
  {
    moduleKey: 'financeiro',
    title: 'Financeiro (card)',
    actions: [
      { label: 'Sangria', example: 'miauby sangria 10 troco' },
      { label: 'PIX CNPJ manual', example: 'miauby pix cnpj 28,90 Sueli' },
      { label: 'Comprovante PIX foto/PDF', example: 'envie o comprovante Pix', note: 'leitura segura; se falhar, pede o comando manual' },
      { label: 'Consultar caixa aberto', example: 'miauby caixa aberto' },
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
      { label: 'Ver automacoes n8n', example: 'miauby n8n' },
    ],
  },
];

export function formatWhatsappCommandHelp(allowedModuleKeys: Iterable<string>): string {
  const allowed = new Set(Array.from(allowedModuleKeys, (key) => key.toLowerCase()));
  const categories = WHATSAPP_COMMAND_HELP_REGISTRY.filter((category) => allowed.has(category.moduleKey));

  if (!categories.length) {
    return [
      'Miauww 😼 Como posso te ajudar hoje?',
      '',
      'Seu numero esta autorizado, mas ainda nao tem cards liberados para comandos no WhatsApp.',
      '',
      'Peca para liberar seus cards no painel Miauby WhatsApp.',
    ].join('\n');
  }

  const lines = [
    'Miauww 😼 *Tabela do Miauby Whats*',
    '',
    'Mensagem de texto sem *miauby* mostra esta tabela e nao executa acao.',
    'Para texto operacional, use *miauby* no comeco. Para comprovante, envie a foto/PDF.',
    '',
  ];

  for (const [index, category] of categories.entries()) {
    lines.push(`*${index + 1}. ${category.title}*`);
    for (const action of category.actions) {
      lines.push(`• *${action.label}*`);
      lines.push(`  Exemplo: _${action.example}_`);
      if (action.note) lines.push(`  Obs: ${action.note}.`);
    }
    lines.push('');
  }

  lines.push('Digite o comando com *miauby* no comeco.');
  return lines.join('\n').trim();
}
