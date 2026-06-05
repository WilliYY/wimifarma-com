export type WhatsappCommandHelpExample = {
  label: string;
  command: string;
};

export type WhatsappCommandHelpCategory = {
  moduleKey: string;
  title: string;
  examples: WhatsappCommandHelpExample[];
};

export const WHATSAPP_COMMAND_HELP_REGISTRY: WhatsappCommandHelpCategory[] = [
  {
    moduleKey: 'financeiro',
    title: 'Financeiro',
    examples: [
      { label: 'Sangria', command: 'miauby sangria 10' },
      { label: 'PIX CNPJ', command: 'miauby pix cnpj 28,90 Sueli' },
    ],
  },
  {
    moduleKey: 'pedidos',
    title: 'Pedidos',
    examples: [
      { label: 'Ver pedidos', command: 'miauby pedido' },
      { label: 'Cancelar pedido', command: 'miauby cancelar pedido ANB' },
    ],
  },
  {
    moduleKey: 'cotacao',
    title: 'Encomendas / Cotação',
    examples: [
      { label: 'Ver encomendas', command: 'miauby encomendas' },
    ],
  },
  {
    moduleKey: 'tarefas',
    title: 'Tarefas',
    examples: [
      { label: 'Ver tarefas', command: 'miauby tarefas' },
      { label: 'Criar tarefa', command: 'miauby tarefa para Thiago conferir pedido' },
    ],
  },
  {
    moduleKey: 'financeiro',
    title: 'Caixa / Alertas',
    examples: [
      { label: 'Consultar caixa', command: 'miauby caixa aberto' },
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
      'Seu número está autorizado, mas ainda não tem cards liberados para comandos no WhatsApp.',
      '',
      'Peça para liberar seus cards no painel Miauby WhatsApp.',
    ].join('\n');
  }

  const lines = [
    'Miauww 😼 Como posso te ajudar hoje?',
    '',
    'Eu consigo ajudar nestas áreas:',
    '',
  ];

  for (const [index, category] of categories.entries()) {
    lines.push(`*${index + 1}. ${category.title}*`);
    for (const example of category.examples) {
      lines.push(`• ${example.label}: ${example.command}`);
    }
    lines.push('');
  }

  lines.push('Digite o comando com miauby no começo.');
  return lines.join('\n').trim();
}
