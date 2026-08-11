export const REFERRAL_REDEMPTION_XP_POINTS = 300;
export const REFERRAL_REDEMPTION_XP_SOURCE = 'referral_coupon_redemption';

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
};

export function canCreateReferralOffers(user: Pick<SessionUser, 'username' | 'role'>): boolean {
  return user.username.trim().toLowerCase() === 'adm' || user.role.trim().toLowerCase() === 'admin';
}

export type PersonInput = {
  name: string;
  phone: string;
  pix: string;
  notes: string;
  active: boolean;
};

export type CouponStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

export type CouponInput = {
  personId: number;
  code: string;
  codeKey: string;
  productName: string;
  normalPriceCents: number;
  promotionalPriceCents: number;
  commissionCents: number;
  startDate: string | null;
  expirationDate: string | null;
  status: CouponStatus;
  automaticCode: boolean;
};

export type PaymentMethod = 'PIX' | 'CASH' | 'OTHER';

export type PaymentInput = {
  personId: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
  notes: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COUPON_RE = /^[A-Z0-9-]{4,24}$/;

export function cleanSingleLine(value: unknown, limit: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function cleanMultiline(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}

export function parsePositiveId(value: unknown): number | null {
  const id = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isBareBasePath(pathname: string, basePath: string): boolean {
  return pathname === basePath;
}

export function parseMoneyToCents(value: unknown): number | null {
  let raw = String(value ?? '').replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!raw || !/^[0-9.,]+$/.test(raw)) return null;

  if (raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (raw.match(/\./g) || []).length;
    if (dots > 1 || (dots === 1 && !/^\d+\.\d{1,2}$/.test(raw))) raw = raw.replace(/\./g, '');
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '0', decimal = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000 ? cents : null;
}

function normalizedLatin(value: unknown): string {
  return cleanSingleLine(value, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export function normalizeCouponCode(value: unknown): string {
  return normalizedLatin(value).replace(/\s+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function couponCodeKey(value: unknown): string {
  return normalizedLatin(value).replace(/[^A-Z0-9]/g, '');
}

export function formatAutomaticCouponCode(personName: unknown, digits: number): string {
  const letters = normalizedLatin(personName).replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const suffix = Math.abs(Math.trunc(digits)) % 10_000;
  return `${letters}-${String(suffix).padStart(4, '0')}`;
}

export function validatePersonInput(input: Record<string, unknown>): ValidationResult<PersonInput> {
  const name = cleanSingleLine(input.name, 160);
  if (name.length < 2) return { ok: false, message: 'Informe o nome do indicador.' };
  const activeValue = input.active;
  const active = activeValue === undefined ? true : ['1', 'true', 'on', 'ACTIVE'].includes(String(activeValue));
  return {
    ok: true,
    value: {
      name,
      phone: cleanSingleLine(input.phone, 40),
      pix: cleanSingleLine(input.pix, 180),
      notes: cleanMultiline(input.notes, 1000),
      active,
    },
  };
}

function optionalDate(value: unknown): string | null | undefined {
  const date = cleanSingleLine(value, 10);
  if (!date) return null;
  if (!DATE_RE.test(date)) return undefined;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? undefined : date;
}

export function validateCouponInput(input: Record<string, unknown>): ValidationResult<CouponInput> {
  const personId = parsePositiveId(input.referral_person_id);
  if (!personId) return { ok: false, message: 'Selecione um indicador valido.' };

  const code = normalizeCouponCode(input.code);
  const codeKey = couponCodeKey(code);
  if (!COUPON_RE.test(code) || codeKey.length < 4) {
    return { ok: false, message: 'Use um codigo de 4 a 24 caracteres com letras, numeros ou hifen.' };
  }

  const productName = cleanSingleLine(input.product_name, 220);
  if (productName.length < 3) return { ok: false, message: 'Informe o produto ou medicamento.' };

  const normalPriceCents = parseMoneyToCents(input.normal_price);
  const promotionalPriceCents = parseMoneyToCents(input.promotional_price);
  const commissionCents = parseMoneyToCents(input.commission_amount);
  if (!normalPriceCents || !promotionalPriceCents || !commissionCents) {
    return { ok: false, message: 'Precos e comissao precisam ser maiores que zero.' };
  }
  if (promotionalPriceCents >= normalPriceCents) {
    return { ok: false, message: 'O preco promocional precisa ser menor que o preco normal.' };
  }
  if (commissionCents > promotionalPriceCents) {
    return { ok: false, message: 'A comissao nao pode superar o preco promocional.' };
  }

  const startDate = optionalDate(input.start_date);
  const expirationDate = optionalDate(input.expiration_date);
  if (startDate === undefined || expirationDate === undefined) return { ok: false, message: 'Informe datas validas.' };
  if (startDate && expirationDate && expirationDate < startDate) {
    return { ok: false, message: 'A validade nao pode ser anterior ao inicio.' };
  }

  const status = cleanSingleLine(input.status || 'ACTIVE', 10).toUpperCase() as CouponStatus;
  if (!['ACTIVE', 'PAUSED', 'CLOSED'].includes(status)) return { ok: false, message: 'Status de cupom invalido.' };

  return {
    ok: true,
    value: {
      personId,
      code,
      codeKey,
      productName,
      normalPriceCents,
      promotionalPriceCents,
      commissionCents,
      startDate,
      expirationDate,
      status,
      automaticCode: ['1', 'true', 'on'].includes(String(input.automatic_code ?? '')),
    },
  };
}

export function couponAvailability(
  coupon: { status: string; startDate: string | null; expirationDate: string | null },
  today: string,
): { available: boolean; reason: string } {
  if (coupon.status !== 'ACTIVE') return { available: false, reason: coupon.status === 'PAUSED' ? 'Cupom pausado.' : 'Cupom encerrado.' };
  if (coupon.startDate && coupon.startDate > today) return { available: false, reason: `Cupom valido a partir de ${coupon.startDate}.` };
  if (coupon.expirationDate && coupon.expirationDate < today) return { available: false, reason: 'Cupom vencido.' };
  return { available: true, reason: 'Cupom disponivel.' };
}

export function referralRedemptionXpReward(redemptionId: number): { points: number; source: string; sourceEntityId: string } {
  const id = Math.trunc(redemptionId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Utilizacao invalida para premiacao de XP.');
  return { points: REFERRAL_REDEMPTION_XP_POINTS, source: REFERRAL_REDEMPTION_XP_SOURCE, sourceEntityId: String(id) };
}

export function signedLedgerAmount(type: 'COMMISSION' | 'REVERSAL' | 'PAYMENT', amountCents: number): number {
  const amount = Math.abs(Math.trunc(amountCents));
  return type === 'COMMISSION' ? amount : -amount;
}

export function validatePaymentInput(input: Record<string, unknown>, availableBalanceCents: number): ValidationResult<PaymentInput> {
  const personId = parsePositiveId(input.referral_person_id);
  const amountCents = parseMoneyToCents(input.amount);
  if (!personId) return { ok: false, message: 'Indicador invalido.' };
  if (!amountCents) return { ok: false, message: 'Informe um valor de pagamento maior que zero.' };
  if (amountCents > Math.max(0, Math.trunc(availableBalanceCents))) {
    return { ok: false, message: 'O pagamento nao pode superar o saldo disponivel.' };
  }
  const paymentMethod = cleanSingleLine(input.payment_method || 'PIX', 10).toUpperCase() as PaymentMethod;
  if (!['PIX', 'CASH', 'OTHER'].includes(paymentMethod)) return { ok: false, message: 'Forma de pagamento invalida.' };
  return {
    ok: true,
    value: { personId, amountCents, paymentMethod, notes: cleanMultiline(input.notes, 500) },
  };
}
