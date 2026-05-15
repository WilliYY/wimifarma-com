import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

const SERVICE_NAME = 'miauw-agent';
const SERVICE_VERSION = '0.2.0';
const AGENT_VERSION = '2.0-fase8';
const PHASE = 'fase8-shadow';
const DEFAULT_MODEL = 'gpt-5.4-mini';

function envString(names: string[], fallback = ''): string {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return fallback;
}

const port = Number.parseInt(envString(['PORT'], '3100'), 10);
const basePath = normalizeBasePath(envString(['MIAUW_AGENT_BASE_PATH'], '/miauw/agent'));
const model = envString(['MIAUW_OPENAI_MODEL', 'OPENAI_MODEL'], DEFAULT_MODEL);
const apiKey = envString(['MIAUW_OPENAI_API_KEY', 'OPENAI_API_KEY']);
const internalToken = envString(['MIAUW_AGENT_INTERNAL_TOKEN', 'MIAUW_GUARDIAN_TOKEN']);

if (apiKey !== '' && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = apiKey;
}

function normalizeBasePath(path: string): string {
  const clean = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean === '' ? '/miauw/agent' : clean;
}

function publicStatus() {
  return {
    ok: true,
    service: SERVICE_NAME,
    service_version: SERVICE_VERSION,
    agent_version: AGENT_VERSION,
    phase: PHASE,
    mode: 'shadow',
    runtime: 'node22-typescript',
    sdk: 'agents-sdk',
    base_path: basePath,
    model,
    api_configured: apiKey !== '',
    internal_token_configured: internalToken !== '',
    writes_enabled: false,
  };
}

function safeText(value: unknown, limit = 4000): string {
  if (typeof value !== 'string') {
    return '';
  }

  return redactSecrets(value).replace(/\r\n/g, '\n').trim().slice(0, limit);
}

function redactSecrets(text: string): string {
  return text
    .replace(/\bsk-[a-z0-9_\-]{8,}\b/giu, 'credencial interna')
    .replace(/\b(bearer|authorization)\s+[a-z0-9._\-]+/giu, 'credencial interna')
    .replace(/\b(api\s*key|apikey|token\s+secreto)\b/giu, 'credencial interna');
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401')) {
    return 'A camada online recusou a credencial configurada.';
  }

  if (lower.includes('quota') || lower.includes('billing') || lower.includes('429')) {
    return 'A camada online bateu em limite ou cobranca.';
  }

  if (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist') || lower.includes('unsupported'))) {
    return 'O modelo configurado nao esta disponivel para esta credencial.';
  }

  if (lower.includes('timeout') || lower.includes('network') || lower.includes('connection')) {
    return 'A camada online nao respondeu a tempo.';
  }

  return 'Nao consegui concluir a execucao do agente agora.';
}

function compareToken(received: string, expected: string): boolean {
  if (received === '' || expected === '') {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  if (internalToken === '') {
    res.status(503).json({
      ok: false,
      error: 'agent_token_not_configured',
      message: 'Servico agente em modo sombra sem token interno configurado.',
    });
    return;
  }

  const headerValue = req.header('X-Miauw-Agent-Token') || req.header('X-Miauw-Internal-Token') || '';
  if (!compareToken(headerValue, internalToken)) {
    res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Token interno invalido.',
    });
    return;
  }

  next();
}

const diagnosticoSombraTool = tool({
  name: 'diagnostico_miauby_sombra',
  description: 'Retorna um resumo seguro do servico Miauby agente em modo sombra, sem executar escritas.',
  parameters: z.object({
    assunto: z.string().max(120).optional(),
  }),
  async execute({ assunto }) {
    return JSON.stringify({
      service: SERVICE_NAME,
      agent_version: AGENT_VERSION,
      phase: PHASE,
      mode: 'shadow',
      assunto: assunto || 'geral',
      writes_enabled: false,
      safety: [
        'Nao executar SQL arbitrario.',
        'Nao gravar dados sem confirmacao humana.',
        'Nao expor credenciais, payload bruto ou bastidor tecnico.',
      ],
    });
  },
});

const miaubyAgent = new Agent({
  name: 'Miauby Operacional Sombra',
  model,
  instructions: [
    'Voce e o Miauby operacional da Wimifarma em modo sombra.',
    'Responda em portugues do Brasil, com foco pratico para a operacao interna.',
    'Nao cite Codex, ChatGPT, fornecedor de IA, chave, token, prompt interno, stack trace ou caminho de servidor.',
    'Nao invente dados reais. Quando faltar produto, valor, data ou responsavel, peca exatamente o dado ausente.',
    'Acoes fortes como sangria, encomenda, cotacao rapida, faturamento ou exclusao exigem confirmacao humana e nao devem ser executadas por este servico sombra.',
    'Use a ferramenta de diagnostico apenas para explicar o proprio modo sombra quando isso ajudar.',
  ].join('\n'),
  tools: [diagnosticoSombraTool],
});

async function executeAgent(message: string, traceId: string): Promise<string> {
  if (apiKey === '') {
    throw new Error('api_key_missing');
  }

  const input = [
    `trace_id: ${traceId}`,
    'modo: sombra, sem escrita real',
    `mensagem_operador: ${message}`,
  ].join('\n');

  const result = await run(miaubyAgent, input, {
    maxTurns: 3,
  });

  return safeText((result as { finalOutput?: unknown }).finalOutput, 4000);
}

function sendSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamAgent(message: string, traceId: string, res: Response): Promise<void> {
  if (apiKey === '') {
    sendSse(res, 'error', {
      message: 'Servico agente sem credencial online configurada.',
    });
    return;
  }

  const input = [
    `trace_id: ${traceId}`,
    'modo: sombra, sem escrita real',
    `mensagem_operador: ${message}`,
  ].join('\n');

  const stream = await run(miaubyAgent, input, {
    maxTurns: 3,
    stream: true,
  });

  const textStream = stream.toTextStream({ compatibleWithNodeStreams: true });
  const chunks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    (textStream as Readable)
      .on('data', (chunk: Buffer | string) => {
        const clean = redactSecrets(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
        chunks.push(clean);
        sendSse(res, 'delta', { text: clean });
      })
      .on('error', reject)
      .on('end', resolve);
  });

  await stream.completed;

  sendSse(res, 'done', {
    ok: true,
    mode: 'shadow',
    trace_id: traceId,
    text: safeText(chunks.join(''), 4000),
  });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({
      ok: false,
      error: 'invalid_json',
      message: 'JSON invalido.',
    });
    return;
  }

  next(error);
});

app.get(`${basePath}/health`, (_req, res) => {
  res.json(publicStatus());
});

app.get(`${basePath}/status`, (_req, res) => {
  res.json(publicStatus());
});

app.post(`${basePath}/run`, requireInternalToken, async (req, res) => {
  const startedAt = Date.now();
  const traceId = safeText(req.body?.trace_id, 80) || crypto.randomUUID().replace(/-/g, '');
  const message = safeText(req.body?.message, 4000);

  if (message === '') {
    res.status(400).json({
      ok: false,
      error: 'missing_message',
      message: 'Informe a mensagem do operador.',
    });
    return;
  }

  try {
    const text = await executeAgent(message, traceId);
    res.json({
      ok: true,
      mode: 'shadow',
      trace_id: traceId,
      model,
      text,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      mode: 'shadow',
      trace_id: traceId,
      error: 'agent_run_failed',
      message: safeError(error),
      duration_ms: Date.now() - startedAt,
    });
  }
});

app.post(`${basePath}/stream`, requireInternalToken, async (req, res) => {
  const traceId = safeText(req.body?.trace_id, 80) || crypto.randomUUID().replace(/-/g, '');
  const message = safeText(req.body?.message, 4000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (message === '') {
    sendSse(res, 'error', {
      error: 'missing_message',
      message: 'Informe a mensagem do operador.',
    });
    res.end();
    return;
  }

  try {
    sendSse(res, 'start', {
      ok: true,
      mode: 'shadow',
      trace_id: traceId,
      model,
    });
    await streamAgent(message, traceId, res);
  } catch (error) {
    sendSse(res, 'error', {
      error: 'agent_stream_failed',
      message: safeError(error),
      trace_id: traceId,
    });
  } finally {
    res.end();
  }
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: 'not_found',
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  res.status(500).json({
    ok: false,
    error: 'internal_error',
    message: 'Falha interna do servico agente.',
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`${SERVICE_NAME} ${SERVICE_VERSION} listening on ${port}${basePath}`);
});
