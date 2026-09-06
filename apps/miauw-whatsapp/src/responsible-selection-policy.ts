export const DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES = 30;

export type ResponsibleSelectionAction =
  | 'sangria'
  | 'pix_cnpj'
  | 'pedido_create'
  | 'pedido_cancel'
  | 'tarefa_status';

export function expiredResponsibleSelectionFallback(action: ResponsibleSelectionAction | string): 'Wimifarma' | null {
  return action === 'pix_cnpj' || action === 'sangria' ? 'Wimifarma' : null;
}

export function shouldFinalizeResponsibleSelectionBeforeMessage(
  action: ResponsibleSelectionAction | string,
  forceNewMessage: boolean,
  isCancellation: boolean,
  hasResponsibleChoice: boolean,
): boolean {
  if (!expiredResponsibleSelectionFallback(action)) return false;
  if (forceNewMessage) return true;
  return !isCancellation && !hasResponsibleChoice;
}

export function responsibleSelectionInstruction(
  action: ResponsibleSelectionAction | string,
  ttlMinutes: number,
  base = 'Responda com o numero ou nome. Para cancelar, digite cancelar.',
): string {
  if (!expiredResponsibleSelectionFallback(action)) return base;
  return `${base} Se ninguem responder em ${ttlMinutes} minutos ou se chegar outra mensagem antes da escolha, vou registrar como Wimifarma.`;
}
