export const DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES = 30;

export type ResponsibleSelectionAction =
  | 'sangria'
  | 'pix_cnpj'
  | 'pedido_create'
  | 'pedido_cancel'
  | 'tarefa_status';

export function expiredResponsibleSelectionFallback(action: ResponsibleSelectionAction | string): 'Sistema' | null {
  return action === 'pix_cnpj' ? 'Sistema' : null;
}

export function responsibleSelectionInstruction(
  action: ResponsibleSelectionAction | string,
  ttlMinutes: number,
  base = 'Responda com o numero ou nome. Para cancelar, digite cancelar.',
): string {
  if (!expiredResponsibleSelectionFallback(action)) return base;
  return `${base} Se ninguem responder em ${ttlMinutes} minutos, vou registrar como Sistema.`;
}
