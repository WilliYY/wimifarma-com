import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMiaubyAudioTtsPrompt,
  DEFAULT_AUDIO_TTS_STYLE,
  DEFAULT_AUDIO_TTS_VOICE,
} from './audio-voice.js';

test('mantem a voz do WhatsApp felina, clara e segura para dados operacionais', () => {
  assert.equal(DEFAULT_AUDIO_TTS_VOICE, 'Zephyr');
  assert.match(DEFAULT_AUDIO_TTS_STYLE, /gata curiosa/);
  assert.match(DEFAULT_AUDIO_TTS_STYLE, /cadencia felina perceptivel/);
  assert.match(DEFAULT_AUDIO_TTS_STYLE, /sem miados repetidos/);
  assert.ok(DEFAULT_AUDIO_TTS_STYLE.length <= 320, 'o estilo precisa caber no limite aceito pelo ambiente');

  const prompt = buildMiaubyAudioTtsPrompt('Estoque baixo de dipirona.', DEFAULT_AUDIO_TTS_STYLE);

  assert.match(prompt, /suspenda o efeito felino e priorize clareza absoluta/);
  assert.match(prompt, /Texto para falar: """Estoque baixo de dipirona\."""/);
});
