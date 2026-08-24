import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasActivationPrefix,
  parseActivationPrefix,
  parseAudioActivationTranscript,
} from './activation-prefix.js';

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

test('aceita variacoes foneticas conservadoras de Miauby no inicio do audio', () => {
  for (const [transcript, expected] of [
    ['Miau bi pedidos de hoje', 'pedidos de hoje'],
    ['Miau bis status do caixa', 'status do caixa'],
    ['Oi, miau bi: relatorio de hoje', 'relatorio de hoje'],
    ['Miau bi miau bi como é que está', 'como é que está'],
  ]) {
    const parsed = parseAudioActivationTranscript(transcript, 'miauby', true);
    assert.equal(parsed.accepted, true, transcript);
    assert.equal(parsed.text, expected, transcript);
    assert.equal(parsed.reason, 'audio_prefix_phonetic', transcript);
  }
});

test('audio valido ja funciona como ativacao sem precisar falar Miauby', () => {
  for (const transcript of ['pedidos de hoje', 'como é que está', 'sangria 10', 'miau alto']) {
    const parsed = parseAudioActivationTranscript(transcript, 'miauby', true);
    assert.equal(parsed.accepted, true, transcript);
    assert.equal(parsed.text, transcript, transcript);
    assert.equal(parsed.reason, 'audio_message_activation', transcript);
  }
  assert.equal(parseAudioActivationTranscript('miau bi', 'miauby', true).reason, 'empty_after_prefix');
});

test('audio preserva prefixo exato e ambiente sem prefixo obrigatorio', () => {
  assert.deepEqual(
    parseAudioActivationTranscript('Miauby pedidos de hoje', 'miauby', true),
    { accepted: true, text: 'pedidos de hoje', reason: '' },
  );
  assert.deepEqual(
    parseAudioActivationTranscript('pedidos de hoje', 'miauby', false),
    { accepted: true, text: 'pedidos de hoje', reason: '' },
  );
  assert.equal(parseActivationPrefix('pedidos de hoje', 'miauby', true).reason, 'missing_prefix');
});
