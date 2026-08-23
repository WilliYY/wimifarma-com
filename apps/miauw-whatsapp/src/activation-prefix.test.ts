import assert from 'node:assert/strict';
import test from 'node:test';

import { hasActivationPrefix, parseActivationPrefix } from './activation-prefix.js';

test('aceita Miauby com ou sem saudacao sem aceitar mencao no meio da frase', () => {
  for (const message of ['Miauby relatorio', 'oi Miauby relatorio', 'Ola MIAUBY, relatorio', 'Olá, Miauby, relatorio', 'bom dia miauby: relatorio']) {
    const parsed = parseActivationPrefix(message, 'miauby', true);
    assert.equal(parsed.accepted, true, message);
    assert.equal(parsed.text, 'relatorio', message);
    assert.equal(hasActivationPrefix(message, 'miauby'), true, message);
  }
  assert.equal(parseActivationPrefix('preciso do Miauby', 'miauby', true).reason, 'missing_prefix');
  assert.equal(parseActivationPrefix('oi equipe', 'miauby', true).accepted, false);
  assert.equal(parseActivationPrefix('oi Miauby', 'miauby', true).reason, 'empty_after_prefix');
});
