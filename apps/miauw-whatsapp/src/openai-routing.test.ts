import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { requestOpenAiResponse, PIX_RECEIPT_RESPONSE_FORMAT } from './openai-provider.js';

const source = fs.readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
function functions(names: string[], dependencies: Record<string, unknown> = {}): Record<string, (...args: any[]) => any> {
  const snippets = names.map((name) => {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    const tail = source.slice(start);
    const end = tail.indexOf('\n}\n') + 2;
    return tail.slice(0, end);
  });
  const code = ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ ...dependencies });
  vm.runInContext(code, context);
  return Object.fromEntries(names.map((name) => [name, context[name]]));
}

test('AI_MODE openai roteia papo e prefixos legados sem chamar Gemini', () => {
  const f = functions(['replyEngineEnv', 'forcedReplyRoute', 'routeWhatsappReply'], {
    textEnv: () => 'openai', REPLY_ENGINE: 'openai', REQUIRE_PREFIX: false,
    ALLOW_COMMANDS_WITHOUT_PREFIX: true, FORCED_GEMINI_PREFIX_PATTERN: /^(gemini|barato|simples)\b[\s,:-]*/i,
    activationMentioned: () => false, localReplyFor: () => '', looksLikeSensitiveRequest: () => false,
    looksLikeStrongWriteCommand: (value: string) => value.includes('sangria'),
    looksLikeInternalReadCommand: () => false,
    geminiConfigured: () => { throw new Error('Google must not be consulted'); },
  });
  assert.equal(f.replyEngineEnv(), 'openai');
  for (const message of ['como funciona?', 'gemini como funciona?', 'barato oi', 'simples oi']) {
    assert.equal(f.routeWhatsappReply(message).engine, 'openai', message);
  }
  assert.equal(f.routeWhatsappReply('sangria 30').engine, 'miauw');
  assert.equal(f.routeWhatsappReply('sangria 30').useTools, true);
});

test('Pix OpenAI explicito usa imagem/PDF Responses e retry conservador no mesmo provider', async () => {
  const calls: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    return Response.json({ output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: JSON.stringify({ confidence: calls.length === 1 ? 0.2 : 1 }) }] }] });
  };
  const f = functions(['requestOpenAiPixReceiptExtraction', 'requestPixReceiptExtraction'], {
    PIX_RECEIPT_OCR_PROVIDER: 'openai', PIX_RECEIPT_OPENAI_OCR_MODEL: 'gpt-6.1-terra',
    OPENAI_API_KEY: 'mock-only', OPENAI_API_BASE_URL: 'https://openai.invalid/v1', PIX_RECEIPT_OCR_TIMEOUT_MS: 1000,
    openAiConfigured: () => true, safeText: (x: unknown) => String(x || ''),
    pixReceiptExtractionSystemInstruction: (pass: string) => pass,
    pixReceiptExtractionPrompt: () => 'Extract', PIX_RECEIPT_RESPONSE_FORMAT,
    requestOpenAiResponse: (config: any, options: any) => requestOpenAiResponse(config, options, fetcher),
    parsePixReceiptExtractionText: (text: string, provider: string, model: string, pass: string) => ({ ...JSON.parse(text), ocrProvider: provider, ocrModel: model, ocrPass: pass }),
    pixReceiptConservativeRetryReason: (value: any) => value.confidence < 1 ? 'low_confidence' : '',
    choosePixReceiptExtractionCandidate: (_first: unknown, second: unknown) => second,
    annotatePixReceiptRetryChoice: (value: unknown) => value,
    isPixReceiptOcrContentError: () => false,
    geminiConfigured: () => { throw new Error('Google must not be consulted'); },
  });
  for (const mimeType of ['image/jpeg', 'application/pdf']) {
    calls.length = 0;
    const value = await f.requestPixReceiptExtraction({ base64: 'bW9jaw==', mimeType, sizeBytes: 4 }, 'trace', { fileName: '', mediaKind: '', caption: '' });
    assert.equal(value.ocrProvider, 'openai');
    assert.equal(value.ocrPass, 'conservative');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].reasoning, { effort: 'low' });
    assert.equal(calls[0].text.format.strict, true);
    assert.equal(calls[0].store, false);
    const media = calls[0].input[0].content[1];
    assert.equal(media.type, mimeType === 'application/pdf' ? 'input_file' : 'input_image');
    if (mimeType === 'application/pdf') assert.match(media.file_data, /^data:application\/pdf;base64,/);
  }
});

test('guard Gemini nao bloqueia OCR OpenAI; limite diario continua aplicado', async () => {
  let attempts = 0;
  const f = functions(['pixReceiptOcrBlockReason'], {
    PIX_RECEIPT_OCR_PROVIDER: 'openai', PIX_RECEIPT_OCR_DAILY_LIMIT: 10,
    pixReceiptOcrUsesGemini: () => false, pixReceiptOcrConfigured: () => true,
    geminiSpendGuardRemainingMs: () => 99999, pixReceiptOcrAttempts24h: async () => attempts,
  });
  assert.equal(await f.pixReceiptOcrBlockReason(), '');
  attempts = 10;
  assert.equal(await f.pixReceiptOcrBlockReason(), 'pix_receipt_ocr_daily_limit_reached');
});

test('transcricao OpenAI passa pelas validacoes existentes sem consultar Gemini', async () => {
  const steps: string[] = [];
  const f = functions(['transcribeQueuedAudio'], {
    AUDIO_INPUT_ENABLED: true, AUDIO_TRANSCRIBE_PROVIDER: 'openai', AUDIO_TRANSCRIBE_MODEL: 'gpt-transcribe',
    AUDIO_TRANSCRIBE_TIMEOUT_MS: 1000, OPENAI_API_KEY: 'mock-only', OPENAI_API_BASE_URL: 'https://openai.invalid/v1',
    audioProviderFromSummary: () => 'evolution', fetchEvolutionAudioMedia: async () => ({ mimeType: 'audio/ogg', base64: 'bW9jaw==' }),
    openAiConfigured: () => true, safeText: (value: unknown) => String(value),
    requestOpenAiTranscription: async () => { steps.push('openai'); return 'transcript'; },
    requestGeminiAudioTranscript: () => { throw new Error('Google must not be consulted'); },
    audioDurationMsFromPayload: () => 1000,
    validateAudioTranscript: (value: string, duration: number) => { assert.equal(value, 'transcript'); assert.equal(duration, 1000); steps.push('validate'); },
    cleanTranscript: (value: string) => { steps.push('clean'); return value; },
  });
  assert.equal(await f.transcribeQueuedAudio({ payload_summary: {}, trace_id: 'trace' }), 'transcript');
  assert.deepEqual(steps, ['openai', 'validate', 'clean']);
});

test('sem prefixo, bloqueio e ambiguidade semanticos encerram antes de qualquer parser legado', async () => {
  for (const status of ['ambiguous', 'blocked']) {
    const f = functions(['requestWhatsappReply'], {
      allowedModuleCardsForHashes: async () => [], choosePreSemanticRoute: () => ({ kind: 'continue' }),
      isMissingPrefixHelpOnly: () => false,
      AGENT_INTERPRET_URL: 'https://internal.invalid/interpret', INTERNAL_TOKEN: 'mock-only', AGENT_INTERPRET_TIMEOUT_MS: 1000,
      resolveSemanticMessage: async (message: string) => {
        assert.equal(message, 'recebi pix 30');
        return { status, clarification: 'Qual conta recebeu?' };
      },
      parsePixCnpjCommand: () => { throw new Error('Legacy parser must not be consulted'); },
    });
    const reply = await f.requestWhatsappReply('recebi pix 30', 'trace', 'mask', [], {});
    assert.equal(reply.reason, status === 'blocked' ? 'semantic_command_blocked' : 'semantic_command_ambiguous');
    assert.equal(reply.text, 'Qual conta recebeu?');
  }
});

test('modo hybrid preserva conversa Gemini e roteamento legado', () => {
  const f = functions(['routeWhatsappReply'], {
    REPLY_ENGINE: 'hybrid', REQUIRE_PREFIX: false, forcedReplyRoute: () => null,
    activationMentioned: () => false, looksLikeSensitiveRequest: () => false,
    localReplyFor: () => '', looksLikeStrongWriteCommand: () => false, geminiConfigured: () => true,
  });
  assert.equal(f.routeWhatsappReply('conversa curta').engine, 'gemini');
});

test('erro OpenAI 429 nunca aciona spend guard Gemini nem vaza corpo remoto', () => {
  const f = functions(['isGeminiSpendGuardText'], { safeError: (error: unknown) => String(error) });
  assert.equal(f.isGeminiSpendGuardText(new Error('openai_http_429')), false);
});

test('falha de contexto OpenAI registra diagnostico sanitizado antes de continuar sem contexto', async () => {
  const steps: string[] = [];
  const logs: unknown[][] = [];
  const f = functions(['requestWhatsappReply'], {
    allowedModuleCardsForHashes: async () => [], choosePreSemanticRoute: () => ({ kind: 'continue' }),
    isMissingPrefixHelpOnly: () => false,
    AGENT_INTERPRET_URL: 'https://internal.invalid/interpret', INTERNAL_TOKEN: 'mock-only', AGENT_INTERPRET_TIMEOUT_MS: 1000,
    resolveSemanticMessage: async (message: string) => ({ status: 'none', message }),
    mightBeFalteiroCommand: () => false, isPixReceiptGeneratedCommand: () => false,
    parsePixCnpjCommand: () => null, parseSangriaCommand: () => null,
    parsePedidosOperationalCommand: () => null, parsePedidosArrivalReply: () => null,
    parsePedidosCreateCommand: () => null, parseTaskCommand: () => null,
    looksLikeN8nStatusRequest: () => false, looksLikeModuleMenuRequest: () => false,
    looksLikePedidosArrivalListRequest: () => false,
    routeWhatsappReply: (message: string) => ({ engine: 'openai', message, reason: 'mode_openai' }),
    advanceReportDialog: () => ({ kind: 'none' }), moduleKeyForText: () => '',
    GEMINI_CONTEXT_TIMEOUT_MS: 1000,
    requestSharedMiauwContext: async () => { throw new Error('private-body mock-secret-key'); },
    recordErrorLog: async (...args: unknown[]) => { steps.push('diagnostic'); logs.push(args); },
    requestOpenAiReply: async (_message: string, _cards: unknown, context: unknown) => {
      assert.equal(context, null);
      steps.push('reply');
      return { text: 'Resposta segura.' };
    },
  });
  const reply = await f.requestWhatsappReply('mensagem privada', 'trace-context', 'mask', [], {});
  assert.equal(reply.text, 'Resposta segura.');
  assert.equal(reply.engine, 'openai');
  assert.deepEqual(steps, ['diagnostic', 'reply']);
  assert.equal(logs.length, 1);
  const [source, severity, error, context] = logs[0] as [string, string, Error, { traceId: string; details: { engine: string; source: string } }];
  assert.equal(source, 'shared_miauw_context');
  assert.equal(severity, 'warn');
  assert.equal(error.message, 'shared_miauw_context_unavailable');
  assert.equal(context.traceId, 'trace-context');
  assert.equal(context.details.engine, 'openai');
  assert.equal(context.details.source, 'requestSharedMiauwContext');
  assert.doesNotMatch(JSON.stringify(logs), /private-body|mock-secret-key|mensagem privada/);
});
