export type CotacaoEncomendasOrder = 'oldest' | 'newest';

export type CotacaoEncomendasCommand = {
  action: 'list';
  order: CotacaoEncomendasOrder;
  raw: string;
  query?: string;
  rowId?: string;
};

export type CotacaoEncomendaItem = {
  rowId?: string;
  line?: number;
  ean: string;
  produto: string;
  quantidade: string;
  categoria?: string;
  detalhes?: string;
  cliente?: string;
  telefone?: string;
  endereco?: string;
  previsao?: string;
  status?: string;
  antesEncomenda?: string;
  depoisEncomenda: string;
  observacaoEncomenda?: string;
  textoCompleto?: string;
  textoEncomenda?: string;
  createdAtBr: string;
  createdAt: string;
};

export type CotacaoEncomendasSummary = {
  items: CotacaoEncomendaItem[];
  total: number;
  returned: number;
  order: CotacaoEncomendasOrder;
  filters?: {
    label?: string;
    scope?: string;
    status?: string;
    requestedField?: string;
    phone?: string;
    terms?: string[];
  };
};

const WRITE_INTENT_PATTERN = /\b(criar|cria|crie|fazer|faz|faca|cadastrar|cadastra|cadastre|anotar|anota|anote|adicionar|adiciona|adicione|registrar|registra|registre|lancar|lançar|lanca|colocar|coloca|coloque|inserir|insere|insira|botar|bota|bote|encomendar|reservar|reserva|reserve|guardar|guarda|guarde|separar|separa|separe)\b/;
const ENCOMENDA_READ_CUE = /\b(?:qual|quais|lista|listar|liste|mostra|mostrar|ver|veja|consulta|consultar|procura|procurar|busca|buscar|tem|temos|ha|existe|existem)\b|\bme\s+(?:fala|fale|diga)\b/;
const RECENT_PATTERN = /\b(recentes?|novas?|ultimas?|últimas?|ultima|última|mais recentes?|mais novas?)\b/;
const OLD_PATTERN = /\b(antigas?|velhas?|paradas?|mais antigas?)\b/;
const FALTEIRO_CANDIDATE_PATTERNS = [
  /^(?:por favor\s+)?(?:falteiro|falta|faltou|acabou)\b/,
  /^(?:por favor\s+)?(?:esta|ta)\s+faltando\b/,
  /^(?:por favor\s+)?(?:ficou|estamos|estou|esta|ta)\s+sem\b/,
  /^(?:por favor\s+)?sem\s+estoque\b/,
  /^(?:por favor\s+)?nao\s+tem\s+mais\b/,
  /^(?:por favor\s+)?terminou\b/,
  /^(?:por favor\s+)?(?:precisa|precisamos|preciso)\s+(?:comprar\b|(?:urgente|urgencia|popular|falta)(?:\s+(?:urgente|urgencia|popular|falta))*\s+de\b)/,
  /^(?:por favor\s+)?(?:precisa|precisamos|preciso)?\s*(?:repor|reposicao)\b/,
  /^(?:por favor\s+)?comprar\b/,
  /^(?:por favor\s+)?(?:nao\s+temos|nao\s+tem|sem)\b/,
  /^(?:por favor\s+)?(?:coloca|coloque|adiciona|adicione|joga|jogue)\b.*\bno\s+falteiro\b/,
  /\b(?:acabou|terminou)(?:\s+(?:urgente|urgencia|popular|falta))*$/,
  /\b(?:esta|ta)\s+(?:em\s+falta|faltando|sem\s+estoque)(?:\s+(?:urgente|urgencia|popular|falta))*$/,
  /\b(?:zerou|estoque\s+baixo|tem\s+pouco|so\s+(?:tem|temos)|tem\s+(?:so|meia\s+caixa)|restou|ultima\s+(?:caixa|unidade)|vai\s+acabar|nao\s+pode\s+faltar)\b/,
];

export function mightBeFalteiroCommand(message: string): boolean {
  if (/\?\s*$/.test(String(message || ''))) return false;
  const activated = /\b(?:miauby|miauw)\b/i.test(String(message || ''));
  const normalized = normalizeIntentText(stripActivationWord(message));
  if (!normalized || /^(?:estamos|estou|ficou|esta|ta)\s+sem\s+(?:internet|energia|tempo|sistema|acesso|sinal|conexao|dados)$/.test(normalized)) {
    return false;
  }
  if (/\b(?:relatorio|historico|qual|quais)\b/.test(normalized)) return false;
  if (/\bfalta\s+(?:de\s+)?(?:chegar|chegando|chegada|chegadas)\b/.test(normalized)) return false;
  if (FALTEIRO_CANDIDATE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (activated
      && /\burgente\b/.test(normalized)
      && !/\b(?:cashback|cotacao|encomenda|financeiro|gestao|pedido|sangria|tarefa)\b/.test(normalized)) {
    return true;
  }
  return /\b(?:falteiro|falta|faltou|faltam|acabou|zerou|acabando|terminou|faltando|comprar|repor|reposicao)\b|\b(?:sem\s+estoque|estoque\s+baixo|tem\s+pouco|so\s+(?:tem|temos)|tem\s+(?:so|meia\s+caixa)|restou|ultima\s+(?:caixa|unidade)|vai\s+acabar|nao\s+pode\s+faltar|nao\s+tem\s+mais|nao\s+temos|nao\s+tem|precis(?:a|amos|o)\s+(?:comprar|repor))\b/.test(normalized);
}

export function parseCotacaoEncomendasCommand(message: string): CotacaoEncomendasCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized || !/\b(?:encomendas?|encomendad[oa]s?)\b/.test(normalized)) return null;
  if (WRITE_INTENT_PATTERN.test(normalized)) return null;
  if (/\b(?:nova|novo)\s+encomenda\b/.test(normalized)) return null;
  const prepositionalRead = /^encomenda\s+(?:de|da|do)\b/.test(normalized);
  if (/^encomenda\s+\S+/.test(normalized) && !ENCOMENDA_READ_CUE.test(normalized) && !prepositionalRead) return null;
  const explicitRead = ENCOMENDA_READ_CUE.test(normalized)
    || /\?\s*$/.test(String(message || ''))
    || /^encomendas?$/.test(normalized)
    || prepositionalRead
    || /\bpedidos?\b.*\bencomendad[oa]s?\b/.test(normalized);
  if (!explicitRead) return null;

  return {
    action: 'list',
    order: RECENT_PATTERN.test(normalized) && !OLD_PATTERN.test(normalized) ? 'newest' : 'oldest',
    raw,
    query: raw,
  };
}

export function formatCotacaoEncomendasMessage(summary: CotacaoEncomendasSummary): string {
  const items = Array.isArray(summary.items) ? summary.items.slice(0, 10) : [];
  if (!items.length) {
    const label = cleanLineText(summary.filters?.label, 140);
    return label
      ? `Não encontrei encomenda ativa para "${label}" na Cotação.`
      : 'Nenhuma encomenda ativa na Cotação 😼';
  }

  const blocks = items.map((item, index) => {
    const product = cleanLineText(item.produto, 120) || 'Sem produto';
    const quantity = cleanLineText(item.quantidade, 60);
    const title = [`${index + 1}. ${product}`, quantity].filter(Boolean).join(' — ');
    const lines = [title];
    const ean = cleanLineText(item.ean, 80);
    if (ean) lines.push(`EAN: ${ean}`);
    const customer = cleanLineText(item.cliente, 120);
    if (customer) lines.push(`Cliente: ${customer}`);
    const phone = cleanLineText(item.telefone, 80);
    if (phone) lines.push(`Telefone: ${phone}`);
    const address = cleanLineText(item.endereco, 180);
    if (address) lines.push(`Endereco: ${address}`);
    const schedule = cleanLineText(item.previsao, 160);
    if (schedule) lines.push(`Previsao: ${schedule}`);
    const status = cleanLineText(item.status, 60);
    if (status) lines.push(`Status: ${status}`);
    const details = cleanLineText(item.detalhes || item.categoria || item.observacaoEncomenda || item.depoisEncomenda, 900);
    if (details) lines.push(`Detalhes: ${details}`);
    const created = formatCreatedAt(item.createdAtBr || item.createdAt);
    if (created) lines.push(`Criada em: ${created}`);
    return lines.join('\n');
  });

  const total = Number.isFinite(summary.total) ? summary.total : items.length;
  const extra = total > items.length ? `\n\nMostrei ${items.length} de ${total}.` : '';
  const noun = total === 1 ? 'encomenda' : 'encomendas';
  return `Encontrei ${total} ${noun} na Cotacao:\n\n${blocks.join('\n\n')}${extra}`;
}

export function formatCotacaoEncomendasDailyMessage(
  summary: CotacaoEncomendasSummary,
  maxLength = 1150,
): string {
  const sourceItems = Array.isArray(summary.items) ? summary.items : [];
  if (!sourceItems.length) {
    return 'Encomendas da Cotação — 17h 😼\n\nNenhuma encomenda ativa agora.';
  }

  const lines = ['Encomendas da Cotação — 17h 😼', ''];
  let shown = 0;
  for (const item of sourceItems) {
    const block = cotacaoDailyItemBlock(item, shown + 1);
    const total = Math.max(Number(summary.total || sourceItems.length), sourceItems.length);
    const hiddenAfterThis = Math.max(0, total - (shown + 1));
    const suffix = hiddenAfterThis > 0 ? `\n\nMais ${hiddenAfterThis} encomenda(s) ativa(s) em /cotacao/.` : '';
    const candidate = [...lines, block].join('\n');
    if (shown > 0 && `${candidate}${suffix}`.length > maxLength) break;
    lines.push(block, '');
    shown += 1;
  }

  const total = Math.max(Number(summary.total || sourceItems.length), sourceItems.length);
  const hidden = Math.max(0, total - shown);
  if (hidden > 0) lines.push(`Mais ${hidden} encomenda(s) ativa(s) em /cotacao/.`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

function cotacaoDailyItemBlock(item: CotacaoEncomendaItem, index: number): string {
  const ean = cleanLineText(item.ean, 80);
  const product = cleanLineText(item.produto, 120) || 'Sem produto';
  const quantity = cleanLineText(item.quantidade, 60);
  const title = `${index}. ${ean ? `EAN ${ean} — ` : ''}${product}${quantity ? ` — qtd ${quantity}` : ''}`;
  const lines = [title];
  const obs = cleanLineText(item.observacaoEncomenda, 220) || [
    cleanLineText(item.antesEncomenda, 120),
    cleanLineText(item.depoisEncomenda, 160),
  ].filter(Boolean).join(' — ');
  if (obs) lines.push(`Obs: ${obs}`);
  const created = formatCreatedAtShort(item.createdAtBr || item.createdAt);
  if (created) lines.push(`Criada em: ${created}`);
  return lines.join('\n');
}

function formatCreatedAtShort(value: string | undefined): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const br = clean.match(/^(\d{2})\/(\d{2})(?:\/\d{4})?,?\s+(\d{2}:\d{2})/);
  if (br) return `${br[1]}/${br[2]} ${br[3]}`;
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]} ${iso[4]}:${iso[5]}`;
  return clean.replace(',', '');
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
