import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseConfirmationPath,
  choosePreSemanticRoute,
} from './conversation-routing.js';

test('consulta simples de encomenda passa pelo roteamento deterministico antes da semantica', () => {
  const route = choosePreSemanticRoute('quais encomenda tem?', false);

  assert.equal(route.kind, 'cotacao_encomendas');
  if (route.kind === 'cotacao_encomendas') {
    assert.equal(route.command.action, 'list');
    assert.equal(route.command.query, 'quais encomenda tem');
  }
});

test('consulta segura de encomenda sem prefixo ainda devolve a lista', () => {
  for (const message of ['quais encomenda tem?', 'o que tem de encomenda e tals?']) {
    const route = choosePreSemanticRoute(message, true);

    assert.equal(route.kind, 'cotacao_encomendas', message);
    if (route.kind === 'cotacao_encomendas') {
      assert.equal(route.command.action, 'list');
    }
  }
});

test('comando comum ou de escrita sem prefixo continua bloqueado', () => {
  assert.deepEqual(choosePreSemanticRoute('me ajuda com isso', true), { kind: 'missing_prefix' });
  assert.deepEqual(
    choosePreSemanticRoute('encomenda losartana 50mg para Maria', true),
    { kind: 'missing_prefix' },
  );
});

test('mensagem sem rota local segue para o interpretador semantico', () => {
  assert.deepEqual(choosePreSemanticRoute('me ajuda com isso', false), { kind: 'semantic' });
});

test('sim sem confirmacao forte pendente continua na memoria conversacional', () => {
  assert.deepEqual(chooseConfirmationPath({ action: 'confirm' }, null), { kind: 'conversation' });
});

test('sim com confirmacao forte pendente continua reservado ao executor seguro', () => {
  const decision = { action: 'confirm' } as const;
  const pending = { id: 'pending-1' };
  assert.deepEqual(chooseConfirmationPath(decision, pending), {
    kind: 'strong_confirmation',
    decision,
    pending,
  });
});
