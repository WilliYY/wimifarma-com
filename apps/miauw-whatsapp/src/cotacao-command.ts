export type CotacaoEncomendasOrder = 'oldest' | 'newest';

export type CotacaoEncomendasCommand = {
  action: 'list';
  order: CotacaoEncomendasOrder;
  raw: string;
};

export type CotacaoEncomendaItem = {
  rowId?: string;
  line?: number;
  ean: string;
  produto: string;
  quantidade: string;
  depoisEncomenda: string;
  textoEncomenda?: string;
  createdAtBr: string;
  createdAt: string;
};

export type CotacaoEncomendasSummary = {
  items: CotacaoEncomendaItem[];
  total: number;
  returned: number;
  order: CotacaoEncomendasOrder;
};

const WRITE_INTENT_PATTERN = /\b(criar|cria|adicionar|adiciona|registrar|registra|lancar|lançar|colocar|coloca|inserir|insere|nova|novo)\b/;
const RECENT_PATTERN = /\b(recentes?|novas?|ultimas?|últimas?|ultima|última|mais recentes?|mais novas?)\b/;
const OLD_PATTERN = /\b(antigas?|velhas?|paradas?|mais antigas?)\b/;

export function parseCotacaoEncomendasCommand(message: string): CotacaoEncomendasCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized || !/\bencomendas?\b/.test(normalized)) return null;
  if (WRITE_INTENT_PATTERN.test(normalized)) return null;

  const readPatterns = [
    /^encomendas?(?:\s+(?:antigas?|velhas?|paradas?|recentes?|novas?|ultimas?|ultima|atuais?))?$/,
    /^(?:lista|listar|mostra|mostrar|ver|veja|consulta|consultar)\s+encomendas?(?:\s+(?:antigas?|velhas?|paradas?|recentes?|novas?|ultimas?|ultima|atuais?))?$/,
    /^o\s+que\s+(?:tem|ha|existe)\s+(?:de\s+|para\s+|pra\s+)?encomendas?$/,
    /^pedidos?\s+encomendas?$/,
  ];
  if (!readPatterns.some((pattern) => pattern.test(normalized))) return null;

  return {
    action: 'list',
    order: RECENT_PATTERN.test(normalized) && !OLD_PATTERN.test(normalized) ? 'newest' : 'oldest',
    raw,
  };
}

export function formatCotacaoEncomendasMessage(summary: CotacaoEncomendasSummary): string {
  const items = Array.isArray(summary.items) ? summary.items.slice(0, 10) : [];
  if (!items.length) {
    return 'Nenhuma encomenda ativa na Cotação 😼';
  }

  const blocks = items.map((item, index) => {
    const ean = cleanLineText(item.ean, 80) || 'Sem EAN';
    const product = cleanLineText(item.produto, 120) || 'Sem produto';
    const quantity = cleanLineText(item.quantidade, 60);
    const title = [`${index + 1}. ${ean}`, product, quantity].filter(Boolean).join(' — ');
    const lines = [title];
    const obs = cleanLineText(item.depoisEncomenda, 160);
    if (obs) lines.push(`Obs: ${obs}`);
    const created = formatCreatedAt(item.createdAtBr || item.createdAt);
    if (created) lines.push(`Criada em: ${created}`);
    return lines.join('\n');
  });

  const total = Number.isFinite(summary.total) ? summary.total : items.length;
  const extra = total > items.length ? `\n\nMostrei ${items.length} de ${total}.` : '';
  return `Encomendas da Cotação 😼\n\n${blocks.join('\n\n')}${extra}`;
}

function stripActivationWord(message: string): string {
  return String(message || '')
    .replace(/^\s*(miauby|miauw)\b[:\-\s]*/i, '')
    .trim();
}

function normalizeIntentText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanLineText(value: string | undefined, maxLength: number): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatCreatedAt(value: string | undefined): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const br = clean.match(/^(\d{2}\/\d{2}\/\d{4}),?\s+(\d{2}:\d{2})/);
  if (br) return `${br[1]} ${br[2]}`;
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} ${iso[4]}:${iso[5]}`;
  return clean.replace(',', '');
}
