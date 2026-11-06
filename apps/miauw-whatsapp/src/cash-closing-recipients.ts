export const CASH_CLOSING_NOTIFICATION_SOURCE = 'automation_financeiro_fechamento_caixa_18h';

type LinkedRecipient = { linkedUserId?: number | null };

export async function resolveAutomationRecipientsForSource<T extends LinkedRecipient>(
  source: string,
  moduleKey: string,
  recipientUserId: number,
  dependencies: {
    listRecipients: (moduleKey: string) => Promise<T[]>;
    isActiveUser: (userId: number) => Promise<boolean>;
  },
): Promise<T[]> {
  if (source !== CASH_CLOSING_NOTIFICATION_SOURCE) return dependencies.listRecipients(moduleKey);
  if (!Number.isSafeInteger(recipientUserId) || recipientUserId <= 0) return [];
  if (!await dependencies.isActiveUser(recipientUserId)) return [];
  const recipients = await dependencies.listRecipients(moduleKey);
  return recipients.filter((recipient) => recipient.linkedUserId === recipientUserId);
}
