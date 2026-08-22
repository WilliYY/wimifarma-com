import type { SemanticMessageEntity, SemanticMessageResult } from './semantic-interpreter-client.js';

export type QuickCashbackRequest = {
  gross_amount: string;
  actor_user_id: number;
  request_id: string;
  source: 'whatsapp';
  request_print: false;
  customer: {
    client_id: number | null;
    name: string;
    phone: string;
    document: string;
    note: string;
  };
};

export type QuickCashbackResponse = {
  voucher: {
    gross_amount: number;
    cashback_amount: number;
  };
  customer: { name?: string } | null;
  xp: {
    awarded?: boolean;
    already_awarded?: boolean;
  };
};

export function buildQuickCashbackRequest(
  semantic: SemanticMessageResult,
  actorUserId: number,
  traceId: string,
): QuickCashbackRequest {
  if (semantic.status !== 'resolved' || semantic.intent !== 'criar_cashback_rapido') {
    throw new Error('Intencao de Cashback invalida.');
  }
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    throw new Error('Vincule este WhatsApp a um usuario Wimifarma antes de gerar Cashback.');
  }
  const amount = entityValue(semantic.entities, 'money');
  if (!amount) throw new Error('Qual foi o valor da compra para gerar o Cashback?');

  const clientDigits = entityValue(semantic.entities, 'customer_id').replace(/\D+/g, '');
  const clientId = Number.parseInt(clientDigits, 10);
  return {
    gross_amount: amount,
    actor_user_id: actorUserId,
    request_id: `whatsapp:${String(traceId || '').trim().slice(0, 120)}`,
    source: 'whatsapp',
    request_print: false,
    customer: {
      client_id: Number.isInteger(clientId) && clientId > 0 ? clientId : null,
      name: entityValue(semantic.entities, 'customer_name'),
      phone: entityValue(semantic.entities, 'phone'),
      document: entityValue(semantic.entities, 'document'),
      note: entityValue(semantic.entities, 'note'),
    },
  };
}

export function formatQuickCashbackReply(result: QuickCashbackResponse): string {
  const benefit = money(result.voucher.cashback_amount);
  const gross = money(result.voucher.gross_amount);
  const customerName = String(result.customer?.name || '').trim();
  let reply = `Cashback de ${benefit} sobre compra de ${gross} gerado.`;
  if (customerName) reply += ` Cliente: ${customerName}.`;
  if (result.xp.awarded) reply += ' +250 XP para o usuario responsavel.';
  else if (result.xp.already_awarded) reply += ' XP ja registrado nesta emissao.';
  reply += ' Para imprimir, abra o Cashback ou o Miauby Interno no computador da impressora.';
  return reply;
}

function entityValue(entities: SemanticMessageEntity[], type: string): string {
  const entity = entities.find((candidate) => candidate.type === type);
  return String(entity?.value || '').trim();
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}
