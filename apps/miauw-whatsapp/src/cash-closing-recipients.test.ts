import assert from 'node:assert/strict';
import test from 'node:test';
import { CASH_CLOSING_NOTIFICATION_SOURCE, resolveAutomationRecipientsForSource } from './cash-closing-recipients.js';

const eligibleRecipients = [
  { linkedUserId: 1, contactId: 'owner' },
  { linkedUserId: 2, contactId: 'colleague' },
  { linkedUserId: 3, contactId: 'manager' },
  { linkedUserId: null, contactId: 'unlinked' },
];

test('fechamento de caixa entrega somente aos contatos elegiveis do usuario configurado', async () => {
  const checkedUsers: number[] = [];
  const recipients = await resolveAutomationRecipientsForSource(CASH_CLOSING_NOTIFICATION_SOURCE, 'financeiro', 1, {
    listRecipients: async (moduleKey) => {
      assert.equal(moduleKey, 'financeiro');
      return eligibleRecipients;
    },
    isActiveUser: async (id) => { checkedUsers.push(id); return true; },
  });
  assert.deepEqual(recipients, [eligibleRecipients[0]]);
  assert.deepEqual(checkedUsers, [1]);
});

test('configuracao ausente ou invalida nunca recorre aos demais usuarios', async () => {
  for (const recipientUserId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const recipients = await resolveAutomationRecipientsForSource(CASH_CLOSING_NOTIFICATION_SOURCE, 'financeiro', recipientUserId, {
      listRecipients: async () => eligibleRecipients,
      isActiveUser: async () => { assert.fail('configuracao invalida nao consulta usuario'); },
    });
    assert.deepEqual(recipients, []);
  }
});

test('usuario inativo bloqueia o fechamento sem fallback para colegas ativos', async () => {
  assert.deepEqual(await resolveAutomationRecipientsForSource(CASH_CLOSING_NOTIFICATION_SOURCE, 'financeiro', 1, {
    listRecipients: async () => eligibleRecipients,
    isActiveUser: async () => false,
  }), []);
});

test('dono bloqueado, sem card ou com alias protegido nao e reintroduzido na lista elegivel', async () => {
  for (const exclusion of ['blocked', 'card_disabled', 'protected_alias', 'no_contact']) {
    const recipients = await resolveAutomationRecipientsForSource(CASH_CLOSING_NOTIFICATION_SOURCE, 'financeiro', 1, {
      listRecipients: async () => eligibleRecipients.slice(1),
      isActiveUser: async () => true,
    });
    assert.deepEqual(recipients, [], exclusion);
  }
});

test('falha na consulta core impede envio sem fallback', async () => {
  await assert.rejects(resolveAutomationRecipientsForSource(CASH_CLOSING_NOTIFICATION_SOURCE, 'financeiro', 1, {
    listRecipients: async () => eligibleRecipients,
    isActiveUser: async () => { throw new Error('core_unavailable'); },
  }), /core_unavailable/);
});

test('Pix e outras automacoes preservam os destinatarios mesmo sem configuracao de caixa', async () => {
  for (const [source, moduleKey] of [
    ['automation_pix_ocr_resumo_diario', 'financeiro'],
    ['automation_pedidos_chegada_17h', 'pedidos'],
    ['automation_cotacao_encomendas_resumo_17h', 'cotacao'],
  ]) {
    const recipients = await resolveAutomationRecipientsForSource(source, moduleKey, 0, {
      listRecipients: async (requestedModule) => {
        assert.equal(requestedModule, moduleKey);
        return eligibleRecipients;
      },
      isActiveUser: async () => { assert.fail('outras fontes nao consultam o dono do caixa'); },
    });
    assert.equal(recipients, eligibleRecipients);
  }
});
