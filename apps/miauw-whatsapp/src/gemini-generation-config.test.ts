import assert from 'node:assert/strict';
import test from 'node:test';
import { geminiGenerationConfig } from './gemini-generation-config.js';

test('Gemini 3.5 Flash Lite uses minimal thinking without legacy sampling controls', () => {
  for (const model of ['gemini-3.5-flash-lite', 'models/gemini-3.5-flash-lite']) {
    assert.deepEqual(geminiGenerationConfig(model, 220, 0.35, 8192), {
      maxOutputTokens: 220,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    });
  }
});

test('Gemini 3.5 Flash Lite transcription preserves its output token limit', () => {
  assert.deepEqual(geminiGenerationConfig('gemini-3.5-flash-lite', 700, 0, 0), {
    maxOutputTokens: 700,
    thinkingConfig: { thinkingLevel: 'MINIMAL' },
  });
});

test('explicit legacy models preserve configured temperature and thinking budget', () => {
  for (const model of ['gemini-2.5-flash', 'models/gemini-2.5-flash-lite']) {
    assert.deepEqual(geminiGenerationConfig(model, 220, 0.35, 1024), {
      temperature: 0.35,
      maxOutputTokens: 220,
      thinkingConfig: { thinkingBudget: 1024 },
    });
    assert.deepEqual(geminiGenerationConfig(model, 700, 0, 0), {
      temperature: 0,
      maxOutputTokens: 700,
      thinkingConfig: { thinkingBudget: 0 },
    });
  }
});
