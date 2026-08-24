const FINAL_STATUSES = new Set(['cancelado', 'resolvido', 'finalizado', 'concluido', 'entregue']);
const WRITE_PATTERN = /\b(?:criar|cria|crie|fazer|faz|faca|cadastrar|cadastra|cadastre|anotar|anota|anote|adicionar|adiciona|adicione|registrar|registra|registre|lancar|lanca|lance|colocar|coloca|coloque|inserir|insere|insira|botar|bota|bote|encomendar|reservar|reserva|reserve|guardar|guarda|guarde|separar|separa|separe)\b/u;
const READ_PATTERN = /\b(?:qual|quais|tem|temos|ha|existe|existem|mostra|mostrar|liste|lista|listar|ver|veja|consulta|consultar|procura|procurar|busca|buscar)\b|\bme\s+(?:fala|fale|diga)\b/u;
const SUBJECT_PATTERN = /\b(?:encomendas?|encomendad[oa]s?)\b/u;
const RECENT_PATTERN = /\b(?:recente|recentes|nova|novas|ultima|ultimas|mais recente|mais recentes)\b/u;
const OLD_PATTERN = /\b(?:antiga|antigas|velha|velhas|parada|paradas|mais antiga|mais antigas)\b/u;
const HISTORY_PATTERN = /\b(?:todas|todos|historico|historica|historicas|antiga|antigas|velha|velhas|cancelada|canceladas|resolvida|resolvidas|finalizada|finalizadas|concluida|concluidas|entregue|entregues)\b/u;
const PHONE_PATTERN = /(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}/u;
const ADDRESS_PATTERN = /^(?:rua|r\.?|avenida|av\.?|travessa|tv\.?|rodovia|estrada|alameda|praca|praça|lote|sitio|sítio)(?:\s|$)/iu;
const SCHEDULE_PATTERN = /^(?:entregar|entrega|retirar|retirada|buscar|hoje|amanha|amanhã|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b/iu;
const NON_PERSON_PATTERN = /\b(?:receita|preferencia|preferência|aceita|similar|generico|genérico|marca|ligar|avisar|perto|referencia|referência|sem|com|depois|antes|entregar|retirar|buscar)\b/iu;

const STOP_WORDS = new Set([
  'a', 'as', 'ai', 'alguma', 'algumas', 'ao', 'aos', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'encomenda', 'encomendas', 'encomendado', 'encomendados', 'encomendada', 'encomendadas', 'esse', 'essa',
  'existe', 'existem', 'fala', 'fale', 'ha', 'historico', 'historica', 'historicas', 'lista', 'listar', 'liste',
  'mais', 'me', 'miauby', 'miauw', 'mostra', 'mostrar', 'no', 'nos', 'o', 'os', 'pedido', 'pedidos',
  'por', 'pra', 'para', 'procura', 'procurar', 'qual', 'quais', 'que', 'tem', 'temos', 'todas', 'todos',
  'ver', 'veja', 'consulta', 'consultar', 'busca', 'buscar', 'diga', 'quem', 'pediu', 'pediram', 'quero', 'uma', 'umas', 'um', 'uns',
  'telefone', 'fone', 'whatsapp', 'endereco', 'status', 'situacao', 'data', 'quando', 'cliente', 'produto',
  'categoria', 'descricao', 'observacao', 'detalhe', 'detalhes', 'atual', 'atuais', 'ativa', 'ativas',
  'aqui', 'agora', 'ainda', 'esta', 'estao', 'estava', 'estavam', 'foi', 'foram', 'sao', 'sendo', 'la', 'tal', 'tals',
  'aberta', 'abertas', 'aberto', 'abertos', 'pendente', 'pendentes', 'enviada', 'enviadas', 'enviado', 'enviados', 'erro', 'cancelada', 'canceladas',
  'cancelado', 'cancelados', 'resolvida', 'resolvidas', 'resolvido', 'resolvidos', 'finalizada', 'finalizadas',
  'concluida', 'concluidas', 'entregue', 'entregues', 'recente', 'recentes', 'nova', 'novas', 'ultima',
  'ultimas', 'antiga', 'antigas', 'velha', 'velhas', 'parada', 'paradas'
]);

export function normalizeEncomendaQueryText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanRawQuery(message) {
  return String(message || '')
    .replace(/^\s*(?:miauby|miauw)\b[\s,:;-]*/iu, '')
    .replace(/[?!;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusFromText(normalized) {
  if (/\bcancelad[oa]s?\b/u.test(normalized)) return 'cancelado';
  if (/\bresolvid[oa]s?\b/u.test(normalized)) return 'resolvido';
  if (/\b(?:finalizad[oa]s?|concluid[oa]s?|entregues?)\b/u.test(normalized)) return 'finalizado';
  if (/\bpendentes?\b/u.test(normalized)) return 'pendente';
  if (/\benviad[oa]s?\b/u.test(normalized)) return 'enviado';
  if (/\b(?:erro|falhou|falha)\b/u.test(normalized)) return 'erro';
  if (/\b(?:ativ[oa]s?|abert[oa]s?)\b/u.test(normalized)) return 'active';
  return '';
}

function requestedFieldFromText(normalized) {
  if (/\b(?:telefone|fone|whatsapp)\b/u.test(normalized)) return 'phone';
  if (/\bendereco\b/u.test(normalized)) return 'address';
  if (/\b(?:status|situacao)\b/u.test(normalized)) return 'status';
  if (/\b(?:data|quando)\b/u.test(normalized)) return 'date';
  if (/\b(?:cliente|de quem)\b/u.test(normalized)) return 'customer';
  if (/\b(?:categoria|descricao|observacao|detalhes?)\b/u.test(normalized)) return 'details';
  if (/\bproduto\b/u.test(normalized)) return 'product';
  return 'all';
}

function significantTerms(normalized, phone) {
  const phoneDigits = String(phone || '').replace(/\D+/g, '');
  return normalized
    .split(' ')
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word))
    .filter((word) => !/^\d+$/.test(word) || !phoneDigits.includes(word))
    .filter((word, index, words) => words.indexOf(word) === index);
}

export function parseEncomendaReadQuery(message) {
  const original = String(message || '').trim();
  const raw = cleanRawQuery(original);
  const normalized = normalizeEncomendaQueryText(raw);
  if (!normalized || !SUBJECT_PATTERN.test(normalized)) return null;
  if (/\b(?:nova|novo)\s+encomenda\b/u.test(normalized)) return null;
  const prepositionalRead = /^encomenda\s+(?:de|da|do)\b/u.test(normalized);
  if (/^encomenda\s+\S+/u.test(normalized) && !READ_PATTERN.test(normalized) && !prepositionalRead) return null;

  const explicitRead = READ_PATTERN.test(normalized)
    || /\?$/.test(original)
    || /^(?:encomenda|encomendas)$/u.test(normalized)
    || prepositionalRead
    || /\bpedidos?\b.*\bencomendad[oa]s?\b/u.test(normalized)
    || /\bo que tem encomendad[oa]?\b/u.test(normalized);
  if (!explicitRead || WRITE_PATTERN.test(normalized)) return null;

  const phoneMatch = raw.match(PHONE_PATTERN);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';
  const phoneDigits = phone.replace(/\D+/g, '');
  const normalizedWithoutPhone = phone
    ? normalizeEncomendaQueryText(raw.replace(phoneMatch[0], ' '))
    : normalized;
  const status = statusFromText(normalized);
  const scope = HISTORY_PATTERN.test(normalized) || ['cancelado', 'resolvido', 'finalizado'].includes(status)
    ? 'history'
    : 'active';
  const terms = significantTerms(normalizedWithoutPhone, phone);
  const labelParts = [...terms];
  if (phoneDigits) labelParts.push(phone);

  return {
    raw,
    normalized,
    order: RECENT_PATTERN.test(normalized) && !OLD_PATTERN.test(normalized) ? 'newest' : 'oldest',
    scope,
    status,
    requestedField: requestedFieldFromText(normalized),
    phone: phoneDigits,
    terms,
    label: labelParts.join(' ').trim()
  };
}

function normalizeStatus(value) {
  const normalized = normalizeEncomendaQueryText(value);
  if (/cancelad/.test(normalized)) return 'cancelado';
  if (/resolvid/.test(normalized)) return 'resolvido';
  if (/finalizad|concluid|entregue/.test(normalized)) return 'finalizado';
  if (/pendente/.test(normalized)) return 'pendente';
  if (/enviad/.test(normalized)) return 'enviado';
  if (/erro|falha/.test(normalized)) return 'erro';
  return normalized || 'ativa';
}

export function isFinalEncomendaStatus(status) {
  return FINAL_STATUSES.has(normalizeStatus(status));
}

function categoryParts(value) {
  return String(value || '')
    .split(/\s*\|\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeEncomendaQueryText(part) !== 'encomenda');
}

function isQuantityPart(part, itemQuantity) {
  const normalized = normalizeEncomendaQueryText(part);
  const normalizedQuantity = normalizeEncomendaQueryText(itemQuantity);
  return (normalizedQuantity !== '' && normalized === normalizedQuantity)
    || /^\d+(?:[.,]\d+)?\s*(?:caixas?|cx|unidades?|un|frascos?|cartelas?|pacotes?|potes?|comprimidos?|cp)\b/iu.test(part);
}

function isPriorityPart(part) {
  return /^(?:urgente|prioridade(?:\s+alta)?|normal)$/iu.test(part.trim());
}

function isSafePersonPart(part) {
  const clean = String(part || '').trim();
  if (!clean || /\d/u.test(clean) || NON_PERSON_PATTERN.test(clean)) return false;
  const words = clean.split(/\s+/u).filter(Boolean);
  return words.length >= 1 && words.length <= 5 && words.every((word) => /^[\p{L}'-]+$/u.test(word));
}

export function decorateEncomendaReadItem(item = {}) {
  const categoria = String(item.categoria || item.detalhes || '').trim();
  const parts = categoryParts(categoria);
  const categoryPhone = parts
    .map((part) => part.match(PHONE_PATTERN)?.[0] || '')
    .find((match) => match.replace(/\D+/g, '').length >= 8) || '';
  const telefone = String(item.telefone || categoryPhone).trim();
  const endereco = String(item.endereco || parts.find((part) => ADDRESS_PATTERN.test(part)) || '').trim();
  const previsao = String(item.previsao || parts.find((part) => SCHEDULE_PATTERN.test(part)) || '').trim();
  const cliente = String(item.cliente || parts.find((part) => {
    if (part === telefone || part === endereco || part === previsao) return false;
    if (isPriorityPart(part) || isQuantityPart(part, item.quantidade)) return false;
    return isSafePersonPart(part);
  }) || '').trim();
  const rawStatus = item.status || item.reminder?.status || 'ativa';
  const status = normalizeStatus(rawStatus);

  return {
    ...item,
    categoria,
    detalhes: categoria,
    cliente,
    telefone,
    endereco,
    previsao,
    status,
    active: !isFinalEncomendaStatus(status)
  };
}

function searchableText(item) {
  return normalizeEncomendaQueryText([
    item.ean,
    item.produto,
    item.quantidade,
    item.categoria,
    item.detalhes,
    item.cliente,
    item.telefone,
    item.endereco,
    item.previsao,
    item.observacaoEncomenda,
    item.textoCompleto,
    item.textoEncomenda,
    item.status
  ].filter(Boolean).join(' '));
}

export function filterEncomendaReadItems(items, query) {
  const parsed = query || parseEncomendaReadQuery('encomendas?');
  return (Array.isArray(items) ? items : [])
    .map((item) => decorateEncomendaReadItem(item))
    .filter((item) => {
      if (parsed.rowId && String(item.rowId || '') !== String(parsed.rowId)) return false;
      if (parsed.scope !== 'history' && isFinalEncomendaStatus(item.status)) return false;
      if (parsed.status === 'active' && isFinalEncomendaStatus(item.status)) return false;
      if (parsed.status === 'finalizado' && !isFinalEncomendaStatus(item.status)) return false;
      if (parsed.status && !['active', 'finalizado'].includes(parsed.status) && item.status !== parsed.status) return false;
      const text = searchableText(item);
      if (parsed.phone && !String(item.telefone || '').replace(/\D+/g, '').includes(parsed.phone)) return false;
      return parsed.terms.every((term) => text.includes(normalizeEncomendaQueryText(term)));
    });
}
