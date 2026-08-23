import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyConversationEffect,
  emptyConversationState,
  resolveConversationMessage,
  type MiaubyConversationState,
} from './conversation-memory.js';

const NOW = new Date('2026-08-22T15:00:00.000Z');
const identity = {
  channel: 'internal' as const,
  userId: '7',
  conversationId: '91',
  sessionId: 'session-a',
};

function activeState(): MiaubyConversationState {
  return emptyConversationState(identity, NOW, 30 * 60);
}

test('ativa a conversa e resolve uma entidade recente pelo nome', () => {
  const first = resolveConversationMessage('Miauby quais encomendas tem?', null, { ...identity, now: NOW });
  assert.equal(first.status, 'route');
  assert.equal(first.message, 'Miauby quais encomendas tem?');
  assert.equal(first.state.active, true);
  assert.equal(first.state.currentTopic, 'encomendas');

  const withItems = applyConversationEffect(first.state, {
    intent: 'consultar_encomendas',
    topic: 'encomendas',
    recentEntities: [
      { index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana 50mg - Maria' },
      { index: 2, type: 'encomenda', id: 'row-2', label: 'Amitriptilina - Joao' },
    ],
  }, NOW);
  const followUp = resolveConversationMessage('qual e da Maria?', withItems, { ...identity, now: NOW });

  assert.equal(followUp.status, 'selected');
  assert.equal(followUp.selectedEntity?.id, 'row-1');
  assert.match(followUp.reply, /Losartana 50mg - Maria/i);

  const whoOrdered = resolveConversationMessage('quem pediu essa amitriptilina?', withItems, { ...identity, now: NOW });
  assert.equal(whoOrdered.selectedEntity?.id, 'row-2');

  const hasLosartana = resolveConversationMessage('tem losartana?', withItems, { ...identity, now: NOW });
  assert.equal(hasLosartana.selectedEntity?.id, 'row-1');

  const withTwoLosartanas = applyConversationEffect(first.state, {
    intent: 'consultar_encomendas',
    topic: 'encomendas',
    recentEntities: [
      { index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana 50mg - Maria' },
      { index: 2, type: 'encomenda', id: 'row-3', label: 'Losartana 100mg - Ana' },
    ],
  }, NOW);
  const filteredFollowUp = resolveConversationMessage('tem losartana?', withTwoLosartanas, { ...identity, now: NOW });
  assert.equal(filteredFollowUp.status, 'route');
  assert.equal(filteredFollowUp.reason, 'contextual_encomenda_read');
  assert.match(filteredFollowUp.message, /encomenda.*losartana/i);
});

test('preserva filtros e reconhece formas naturais de consultar encomendas', () => {
  for (const message of [
    'Miauby qual e o telefone da encomenda de losartana da Maria?',
    'MIAUBY quais pedidos estao encomendados?',
    'Miauby o que tem encomendado?',
    'Miauby quero ver as encomendas',
    'Miauby encomenda da Maria',
    'Miauby encomenda de atenolol farmacia popular',
    'Miauby tem alguma encomenda pendente?',
  ]) {
    const result = resolveConversationMessage(message, null, { ...identity, now: NOW });
    assert.equal(result.status, 'route', `Consulta nao roteada: ${message}`);
    assert.equal(result.reason, 'explicit_encomenda_read');
    assert.equal(result.message, message);
    assert.equal(result.state.lastIntent, 'consultar_encomendas');
  }
});

test('entende pedido encomendado sem exigir verbo em posicao fixa', () => {
  const result = resolveConversationMessage('Miauby pedido encomendado', null, { ...identity, now: NOW });
  assert.equal(result.reason, 'explicit_encomenda_read');
});

test('nao roteia criacao de encomenda como leitura', () => {
  for (const message of [
    'Miauby encomenda losartana 50mg para Maria',
    'Miauby encomenda losartana 50mg para Maria?',
    'Miauby faz uma encomenda de atenolol para Maria',
    'Miauby nova encomenda de dipirona para Joao',
    'Miauby cadastra encomenda de dipirona?',
    'Miauby anota encomenda de losartana',
    'Miauby coloca losartana na encomenda da Maria',
  ]) {
    const result = resolveConversationMessage(message, null, { ...identity, now: NOW });
    assert.notEqual(result.reason, 'explicit_encomenda_read');
  }
  const genericOrders = resolveConversationMessage('Miauby quais pedidos tem?', null, { ...identity, now: NOW });
  assert.notEqual(genericOrders.reason, 'explicit_encomenda_read');
});

test('preserva no Interno o comando explicito inicial sem palavra de ativacao', () => {
  const first = resolveConversationMessage('quais encomendas tem?', null, { ...identity, now: NOW });
  assert.equal(first.status, 'route');
  assert.equal(first.reason, 'explicit_encomenda_read');
  assert.equal(first.state.active, true);

  const withItems = applyConversationEffect(first.state, {
    topic: 'encomendas',
    recentEntities: [{ index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana - Maria' }],
  }, NOW);
  assert.equal(resolveConversationMessage('qual e da Maria?', withItems, { ...identity, now: NOW }).selectedEntity?.id, 'row-1');

  const whatsappIdentity = { ...identity, channel: 'whatsapp' as const };
  assert.equal(
    resolveConversationMessage('quais encomendas tem?', null, { ...whatsappIdentity, now: NOW }).status,
    'inactive',
  );
});

test('seleciona somente dentro de uma lista recente valida', () => {
  const state = applyConversationEffect(activeState(), {
    topic: 'encomendas',
    recentEntities: [
      { index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' },
      { index: 2, type: 'encomenda', id: '2', label: 'Amitriptilina - Joao' },
      { index: 3, type: 'encomenda', id: '3', label: 'Dipirona - Ana' },
    ],
  }, NOW);

  assert.equal(resolveConversationMessage('o segundo', state, { ...identity, now: NOW }).selectedEntity?.id, '2');
  assert.equal(resolveConversationMessage('2', state, { ...identity, now: NOW }).selectedEntity?.id, '2');
  assert.equal(resolveConversationMessage('o ultimo', state, { ...identity, now: NOW }).selectedEntity?.id, '3');
  assert.equal(resolveConversationMessage('2', null, { ...identity, now: NOW }).status, 'inactive');
});

test('mantem a entidade escolhida como referencia para a acao seguinte', () => {
  const state = applyConversationEffect(activeState(), {
    topic: 'encomendas',
    recentEntities: [
      { index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' },
      { index: 2, type: 'encomenda', id: '2', label: 'Amitriptilina - Joao' },
      { index: 3, type: 'encomenda', id: '3', label: 'Dipirona - Ana' },
    ],
  }, NOW);

  const selected = resolveConversationMessage('o segundo', state, { ...identity, now: NOW });
  const pending = resolveConversationMessage('cancela ela', selected.state, { ...identity, now: NOW });
  const confirmed = resolveConversationMessage('sim', pending.state, { ...identity, now: NOW });

  assert.equal(selected.selectedEntity?.id, '2');
  assert.equal(pending.status, 'pending_action');
  assert.equal(pending.pendingAction?.entity?.id, '2');
  assert.equal(confirmed.status, 'confirm');
  assert.equal(confirmed.pendingAction?.entity?.id, '2');
});

test('consome somente a resposta de uma pergunta pendente valida', () => {
  const withQuestion = applyConversationEffect(activeState(), {
    topic: 'relatorio',
    pendingQuestion: {
      key: 'report_date',
      prompt: 'Qual dia?',
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    },
  }, NOW);

  const answer = resolveConversationMessage('ontem', withQuestion, { ...identity, now: NOW });
  assert.equal(answer.status, 'route');
  assert.equal(answer.reason, 'pending_question_answered');
  assert.equal(answer.state.pendingQuestion, null);
});

test('cria acao pendente por referencia e separa confirmacao de recusa', () => {
  const state = applyConversationEffect(activeState(), {
    topic: 'encomendas',
    recentEntities: [{ index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana 50mg - Maria' }],
  }, NOW);
  const pending = resolveConversationMessage('cancela ela', state, { ...identity, now: NOW });
  assert.equal(pending.status, 'pending_action');
  assert.equal(pending.state.pendingAction?.entity?.id, 'row-1');

  const confirmed = resolveConversationMessage('sim', pending.state, { ...identity, now: NOW });
  assert.equal(confirmed.status, 'confirm');
  assert.equal(confirmed.state.pendingAction, null);
  assert.equal(confirmed.pendingAction?.entity?.id, 'row-1');

  const rejected = resolveConversationMessage('nao', pending.state, { ...identity, now: NOW });
  assert.equal(rejected.status, 'reject');
  assert.equal(rejected.state.pendingAction, null);
});

test('continua o Falteiro sem repetir a palavra de ativacao', () => {
  const first = resolveConversationMessage('Miauby falta losartana', null, { ...identity, now: NOW });
  assert.equal(first.state.currentTopic, 'falteiro');
  assert.equal(first.state.lastIntent, 'registrar_falteiro');

  const second = resolveConversationMessage('atenolol tambem', first.state, { ...identity, now: NOW });
  assert.equal(second.status, 'route');
  assert.match(second.message, /falta atenolol/i);

  const third = resolveConversationMessage('amitriptilina tambem', second.state, { ...identity, now: NOW });
  assert.match(third.message, /falta amitriptilina/i);
});

test('uma intencao explicita nova vence o topico anterior', () => {
  const falteiro = resolveConversationMessage('Miauby falta losartana', null, { ...identity, now: NOW });
  const encomendas = resolveConversationMessage('quais encomendas tem?', falteiro.state, { ...identity, now: NOW });

  assert.equal(encomendas.status, 'route');
  assert.equal(encomendas.state.currentTopic, 'encomendas');
  assert.equal(encomendas.state.lastIntent, 'consultar_encomendas');
});

test('nao confirma acao expirada nem seleciona lista de contexto expirado', () => {
  const expiredAt = new Date(NOW.getTime() - 1000).toISOString();
  const expired = {
    ...activeState(),
    expiresAt: expiredAt,
    pendingAction: {
      id: 'cancel-row-1',
      intent: 'cancelar_encomenda',
      entity: { index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana - Maria' },
      createdAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      expiresAt: expiredAt,
    },
    recentEntities: [{ index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana - Maria' }],
  } satisfies MiaubyConversationState;

  assert.equal(resolveConversationMessage('sim', expired, { ...identity, now: NOW }).status, 'expired');
  assert.equal(resolveConversationMessage('o segundo', expired, { ...identity, now: NOW }).status, 'expired');
});

test('mantem estado isolado por identidade e permite reset explicito', () => {
  const userA = resolveConversationMessage('Miauby falta losartana', null, { ...identity, now: NOW });
  const userBIdentity = { ...identity, userId: '8', conversationId: '92', sessionId: 'session-b' };
  const userB = resolveConversationMessage('sim', null, { ...userBIdentity, now: NOW });

  assert.equal(userA.state.userId, '7');
  assert.equal(userB.state.userId, '8');
  assert.equal(userB.status, 'inactive');

  const reset = resolveConversationMessage('miauby encerra', userA.state, { ...identity, now: NOW });
  assert.equal(reset.status, 'reset');
  assert.equal(reset.state.active, false);
  assert.equal(reset.state.recentEntities.length, 0);
});

test('ativa com saudacao e aceita todas as respostas curtas de confirmacao e recusa', () => {
  const activated = resolveConversationMessage('oi Miauby, me ajuda', null, { ...identity, now: NOW });
  assert.equal(activated.state.active, true);
  assert.notEqual(activated.status, 'inactive');

  const entity = { index: 1, type: 'encomenda', id: 'row-1', label: 'Losartana - Maria' };
  const base = applyConversationEffect(activated.state, {
    pendingAction: {
      id: 'cancel-row-1',
      intent: 'cancelar_encomenda',
      entity,
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    },
  }, NOW);

  for (const answer of ['okay', 'faz sim', 'pode fazer', 'vai sim', 'correto', 'e esse', 'esse mesmo']) {
    const result = resolveConversationMessage(answer, base, { ...identity, now: NOW });
    assert.equal(result.status, 'confirm', answer);
    assert.equal(result.pendingAction?.entity?.id, 'row-1', answer);
  }
  for (const answer of ['nn', 'nao quero', 'volta']) {
    const result = resolveConversationMessage(answer, base, { ...identity, now: NOW });
    assert.equal(result.status, 'reject', answer);
    assert.equal(result.state.pendingAction, null, answer);
  }
});

test('sim e nao sem pendencia nunca viram comandos ou acoes antigas', () => {
  const state = resolveConversationMessage('Miauby quais encomendas tem?', null, { ...identity, now: NOW }).state;
  for (const answer of ['sim', 'pode', 'nao', 'deixa']) {
    const result = resolveConversationMessage(answer, state, { ...identity, now: NOW });
    assert.equal(result.status, 'reply', answer);
    assert.equal(result.reason, 'confirmation_without_pending_action', answer);
    assert.match(result.reply, /nenhuma confirmacao pendente/i, answer);
  }
});

test('entende pronomes, posicoes visuais e desambigua antes de cancelar', () => {
  const state = applyConversationEffect(activeState(), {
    topic: 'encomendas',
    recentEntities: [
      { index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' },
      { index: 2, type: 'encomenda', id: '2', label: 'Amitriptilina - Joao' },
    ],
  }, NOW);

  assert.equal(resolveConversationMessage('qual telefone dela?', applyConversationEffect(state, {
    recentEntities: [{ index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' }],
  }, NOW), { ...identity, now: NOW }).selectedEntity?.id, '1');
  assert.equal(resolveConversationMessage('o de cima', state, { ...identity, now: NOW }).selectedEntity?.id, '1');
  assert.equal(resolveConversationMessage('o de baixo', state, { ...identity, now: NOW }).selectedEntity?.id, '2');

  const ambiguous = resolveConversationMessage('cancela ela', state, { ...identity, now: NOW });
  assert.equal(ambiguous.status, 'reply');
  assert.equal(ambiguous.reason, 'ambiguous_recent_entity');
  assert.equal(ambiguous.state.pendingSelection?.entities.length, 2);
  assert.match(ambiguous.reply, /qual delas/i);

  const picked = resolveConversationMessage('a de losartana', ambiguous.state, { ...identity, now: NOW });
  assert.equal(picked.status, 'pending_action');
  assert.equal(picked.pendingAction?.intent, 'cancelar_encomenda');
  assert.equal(picked.pendingAction?.entity?.id, '1');
  assert.equal(picked.state.pendingSelection, null);

  const confirmed = resolveConversationMessage('sim', picked.state, { ...identity, now: NOW });
  assert.equal(confirmed.status, 'confirm');
  assert.equal(confirmed.state.pendingSelection, null);
});

test('continua Falteiro e Cashback apenas com marcadores contextuais seguros', () => {
  const falteiro = resolveConversationMessage('Miauby falta losartana', null, { ...identity, now: NOW });
  const nextProduct = resolveConversationMessage('e amitriptilina', falteiro.state, { ...identity, now: NOW });
  assert.equal(nextProduct.reason, 'topic_continuation');
  assert.match(nextProduct.message, /falta amitriptilina/i);

  const cashback = resolveConversationMessage('Miauby cashback 35', null, { ...identity, now: NOW });
  assert.equal(cashback.state.lastIntent, 'criar_cashback_rapido');
  const nextCashback = resolveConversationMessage('agora 42', cashback.state, { ...identity, now: NOW });
  assert.equal(nextCashback.reason, 'topic_continuation');
  assert.match(nextCashback.message, /cashback 42/i);

  const unsafeBareNumber = resolveConversationMessage('42', cashback.state, { ...identity, now: NOW });
  assert.equal(unsafeBareNumber.reason, 'active_conversation');
  assert.notEqual(unsafeBareNumber.semantic.intent, 'criar_cashback_rapido');

  const unsafeQuestion = resolveConversationMessage('e amanha?', falteiro.state, { ...identity, now: NOW });
  assert.notEqual(unsafeQuestion.reason, 'topic_continuation');
  for (const socialReply of ['e obrigado', 'e tudo bem', 'e valeu']) {
    assert.notEqual(
      resolveConversationMessage(socialReply, falteiro.state, { ...identity, now: NOW }).reason,
      'topic_continuation',
      socialReply,
    );
  }
});

test('aceita todos os resets pedidos e limpa o estado por completo', () => {
  const state = applyConversationEffect(activeState(), {
    intent: 'consultar_encomendas',
    topic: 'encomendas',
    filters: { cliente: 'Maria' },
    recentEntities: [{ index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' }],
  }, NOW);
  for (const command of ['miauby sair', 'encerra conversa', 'limpa contexto']) {
    const result = resolveConversationMessage(command, state, { ...identity, now: NOW });
    assert.equal(result.status, 'reset', command);
    assert.equal(result.state.active, false, command);
    assert.equal(result.state.currentTopic, '', command);
    assert.equal(result.state.lastIntent, '', command);
    assert.deepEqual(result.state.lastFilters, {}, command);
    assert.deepEqual(result.state.recentEntities, [], command);
    assert.equal(result.state.pendingAction, null, command);
    assert.equal(result.state.pendingSelection, null, command);
  }
});

test('explica como o contexto foi resolvido sem expor estado de outra identidade', () => {
  const state = applyConversationEffect(activeState(), {
    topic: 'encomendas',
    intent: 'consultar_encomendas',
    recentEntities: [{ index: 1, type: 'encomenda', id: '1', label: 'Losartana - Maria' }],
  }, NOW);
  const result = resolveConversationMessage('qual telefone dela?', state, { ...identity, now: NOW });

  assert.equal(result.diagnostics.rawMessage, 'qual telefone dela?');
  assert.equal(result.diagnostics.sessionActive, true);
  assert.equal(result.diagnostics.currentTopic, 'encomendas');
  assert.equal(result.diagnostics.resolvedIntent, 'consultar_encomendas');
  assert.equal(result.diagnostics.contextUsed, true);
  assert.deepEqual(result.diagnostics.referencedEntity, { type: 'encomenda', id: '1' });
  assert.ok(result.diagnostics.confidence > 0);

  const explicit = resolveConversationMessage('Miauby falta Losartana 50mg', null, { ...identity, now: NOW });
  assert.equal(explicit.diagnostics.rawMessage, 'Miauby falta Losartana 50mg');
});

test('ativa com saudacao acentuada e pontuada', () => {
  const result = resolveConversationMessage('Olá, Miauby, me ajuda', null, { ...identity, now: NOW });
  assert.equal(result.state.active, true);
  assert.notEqual(result.status, 'inactive');
});
