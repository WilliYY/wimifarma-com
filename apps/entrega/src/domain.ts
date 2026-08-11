export type DeliveryInput = {
  customerName: string;
  customerPhone: string;
  address: string;
};

export const XP_DELIVERY_CREATION_POINTS = 400;
export const XP_DELIVERY_CREATION_SOURCE = 'delivery_creation';

export type XpRewardDescriptor = {
  points: number;
  source: string;
  sourceEntityId: string;
};

export function deliveryCreationXpReward(deliveryId: number): XpRewardDescriptor {
  const normalizedDeliveryId = Math.trunc(deliveryId);
  if (!Number.isSafeInteger(normalizedDeliveryId) || normalizedDeliveryId <= 0) {
    throw new Error('Entrega invalida para premiacao de XP.');
  }
  return {
    points: XP_DELIVERY_CREATION_POINTS,
    source: XP_DELIVERY_CREATION_SOURCE,
    sourceEntityId: String(normalizedDeliveryId),
  };
}

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
};

export type HistoryFilters = {
  query: string;
  period: 'today' | 'month' | 'previous' | 'custom' | 'all';
  startDate: string;
  endDate: string;
  userId: number | null;
  status: 'ACTIVE' | 'CANCELLED' | '';
  page: number;
};

export type CommissionPaymentInput = {
  userId: number;
  periodMonth: string;
  requestToken: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cleanSingleLine(value: unknown, limit: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.slice(0, limit) : clean;
}

export function normalizePhone(value: unknown): { display: string; digits: string } {
  const display = cleanSingleLine(value, 40);
  return { display, digits: display.replace(/\D+/g, '') };
}

export function validateDeliveryInput(input: Record<string, unknown>): {
  value: DeliveryInput | null;
  errors: string[];
} {
  const customerName = cleanSingleLine(input.customer_name, 160);
  const phone = normalizePhone(input.customer_phone);
  const address = cleanSingleLine(input.address, 500);
  const errors: string[] = [];

  if (!customerName) errors.push('Informe o nome do cliente.');
  if (!phone.display) errors.push('Informe o telefone ou WhatsApp.');
  if (phone.display && (phone.digits.length < 8 || phone.digits.length > 15)) {
    errors.push('Informe um telefone valido, com DDD quando houver.');
  }
  if (!address) errors.push('Informe o endereco completo.');

  return {
    value: errors.length === 0 ? { customerName, customerPhone: phone.display, address } : null,
    errors,
  };
}

export function validateResponsibleUserId(value: unknown): number | null {
  const normalized = cleanSingleLine(value, 20);
  if (!/^\d+$/.test(normalized)) return null;
  const userId = Number(normalized);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function normalizeUsername(value: unknown): string {
  return cleanSingleLine(value, 100).toLowerCase();
}

export function isBareBasePath(pathname: string, basePath: string): boolean {
  return pathname === basePath;
}

export function canManageAll(user: Pick<SessionUser, 'username' | 'role'>): boolean {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  return username === 'adm' || role === 'admin' || role === 'gerente';
}

export function formatDeliveryNumber(id: number | string): string {
  const numeric = Math.max(0, Number.parseInt(String(id), 10) || 0);
  return `#${String(numeric).padStart(6, '0')}`;
}

export function localDateParts(date = new Date(), timeZone = 'America/Sao_Paulo'): {
  date: string;
  month: string;
} {
  const dateText = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return { date: dateText, month: dateText.slice(0, 7) };
}

export function normalizeMonth(value: unknown, fallback = localDateParts().month): string {
  const text = cleanSingleLine(value, 7);
  const match = MONTH_RE.exec(text);
  if (!match) return fallback;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? text : fallback;
}

export function validateCommissionPaymentInput(input: Record<string, unknown>): {
  value: CommissionPaymentInput | null;
  errors: string[];
} {
  const userId = Number.parseInt(String(input.user_id || ''), 10);
  const periodMonth = cleanSingleLine(input.period_month, 7);
  const requestToken = cleanSingleLine(input.request_token, 36);
  const monthMatch = MONTH_RE.exec(periodMonth);
  const errors: string[] = [];

  if (!Number.isSafeInteger(userId) || userId <= 0) errors.push('Selecione um usuario valido.');
  if (!monthMatch || Number(monthMatch[2]) < 1 || Number(monthMatch[2]) > 12) errors.push('Selecione um mes valido.');
  if (!UUID_RE.test(requestToken)) errors.push('Recarregue a pagina antes de pagar a comissao.');

  return {
    value: errors.length === 0 ? { userId, periodMonth, requestToken } : null,
    errors,
  };
}

export function previousMonth(month: string): string {
  const normalized = normalizeMonth(month);
  const [year, monthNumber] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function normalizeDate(value: unknown): string {
  const text = cleanSingleLine(value, 10);
  if (!DATE_RE.test(text)) return '';
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return text;
}

export function normalizeHistoryFilters(
  input: Record<string, unknown>,
  options: { manager: boolean; currentMonth?: string } = { manager: false },
): HistoryFilters {
  const allowedPeriods = new Set(['today', 'month', 'previous', 'custom', 'all']);
  const requestedPeriod = cleanSingleLine(input.period, 12);
  const period = (allowedPeriods.has(requestedPeriod) ? requestedPeriod : 'month') as HistoryFilters['period'];
  const statusText = cleanSingleLine(input.status, 12).toUpperCase();
  const status = statusText === 'ACTIVE' || statusText === 'CANCELLED' ? statusText : '';
  const requestedUserId = Number.parseInt(String(input.user_id || ''), 10);
  const page = Math.max(1, Math.min(10000, Number.parseInt(String(input.page || '1'), 10) || 1));

  return {
    query: cleanSingleLine(input.q, 120),
    period,
    startDate: period === 'custom' ? normalizeDate(input.start_date) : '',
    endDate: period === 'custom' ? normalizeDate(input.end_date) : '',
    userId: options.manager && Number.isSafeInteger(requestedUserId) && requestedUserId > 0 ? requestedUserId : null,
    status,
    page,
  };
}
