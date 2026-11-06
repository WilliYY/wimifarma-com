import assert from 'node:assert/strict';
import test from 'node:test';
import { openAiResponseText, requestOpenAiResponse, requestOpenAiTranscription, PIX_RECEIPT_RESPONSE_FORMAT } from './openai-provider.js';

const config = { apiKey: 'mock-only', baseUrl: 'https://openai.invalid/v1', model: 'gpt-6.1-terra', timeoutMs: 1000 };

test('Responses agrega somente output_text e rejeita refusal/incomplete antes do JSON', () => {
  assert.equal(openAiResponseText({ output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: '{"ok":' }, { type: 'output_text', text: 'true}' }] }] }), '{"ok":true}');
  assert.throws(() => openAiResponseText({ status: 'incomplete', output_text: '{"ok":true}' }), /openai_response_incomplete/);
  assert.throws(() => openAiResponseText({ output: [{ content: [{ type: 'refusal', refusal: 'private text' }] }] }), /openai_response_refused/);
});

test('chat Responses omite controles legados, nao armazena e nao vaza erro remoto', async () => {
  let body: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://openai.invalid/v1/responses');
    body = JSON.parse(String(init?.body));
    return Response.json({ output: [{ content: [{ type: 'output_text', text: 'Oi.' }] }] });
  };
  assert.equal(await requestOpenAiResponse(config, { instructions: 'Miauby', input: 'oi', maxOutputTokens: 220, effort: 'none' }, fetcher), 'Oi.');
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.equal(body.temperature, undefined);
  assert.equal(body.top_p, undefined);
  await assert.rejects(requestOpenAiResponse(config, { instructions: '', input: 'oi', maxOutputTokens: 220, effort: 'none' }, async () => Response.json({ error: { message: 'mock-secret-bytes', code: 'bad' } }, { status: 429 })), /^Error: openai_http_429$/);
});

test('schema Pix estrito exige todos os campos e objeto aninhado fechado', () => {
  assert.equal(PIX_RECEIPT_RESPONSE_FORMAT.type, 'json_schema');
  assert.equal(PIX_RECEIPT_RESPONSE_FORMAT.strict, true);
  const schema = PIX_RECEIPT_RESPONSE_FORMAT.schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, Object.keys(schema.properties));
  assert.equal(schema.properties.field_confidences.additionalProperties, false);
});

test('transcricao envia multipart com arquivo MIME correto e languages[] pt sem prompt', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://openai.invalid/v1/audio/transcriptions');
    assert.equal((init?.headers as Record<string, string>)['Content-Type'], undefined);
    const form = init?.body as FormData;
    assert.equal(form.get('model'), 'gpt-transcribe');
    assert.deepEqual(form.getAll('languages[]'), ['pt']);
    assert.equal(form.get('language'), null);
    assert.equal(form.get('prompt'), null);
    assert.equal(form.get('keywords'), null);
    const file = form.get('file') as File;
    assert.equal(file.name, 'audio.ogg');
    assert.equal(file.type, 'audio/ogg');
    assert.equal(await file.text(), 'mock audio');
    return Response.json({ text: 'recebi pix de trinta reais' });
  };
  assert.equal(await requestOpenAiTranscription({ ...config, model: 'gpt-transcribe' }, { base64: Buffer.from('mock audio').toString('base64'), mimeType: 'audio/ogg' }, fetcher), 'recebi pix de trinta reais');
});
