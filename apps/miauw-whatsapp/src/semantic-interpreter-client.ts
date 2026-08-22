export type SemanticMessageResult = {
  status: 'resolved' | 'ambiguous' | 'blocked' | 'none' | 'fallback';
  message: string;
  intent: string;
  module: string;
  confidence: number;
  clarification: string;
  entities: SemanticMessageEntity[];
};

export type SemanticMessageEntity = {
  type: string;
  value: string;
  raw: string;
  confidence: number;
};

type ResolveOptions = {
  url: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

type SemanticResponse = {
  ok?: boolean;
  status?: unknown;
  intent?: unknown;
  module?: unknown;
  confidence?: unknown;
  canonical_message?: unknown;
  clarification?: unknown;
  entities?: unknown;
};

export async function resolveSemanticMessage(message: string, options: ResolveOptions): Promise<SemanticMessageResult> {
  const original = String(message || '').trim();
  if (!original || !options.url || !options.token) return fallback(original);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, options.timeoutMs));
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const response = await fetchImpl(options.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Miauw-Agent-Token': options.token,
      },
      body: JSON.stringify({ message: original, channel: 'whatsapp' }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as SemanticResponse | null;
    if (!response.ok || !body || body.ok !== true) return fallback(original);

    const status = stringValue(body.status);
    if (status === 'ambiguous' || status === 'blocked') {
      return {
        status,
        message: '',
        intent: stringValue(body.intent),
        module: stringValue(body.module),
        confidence: numberValue(body.confidence),
        clarification: stringValue(body.clarification)
          || (status === 'blocked' ? 'Entendi. Nao vou executar essa acao.' : 'Qual acao voce quer executar?'),
        entities: semanticEntities(body.entities),
      };
    }
    if (status === 'resolved') {
      const canonical = stringValue(body.canonical_message);
      if (!canonical) return fallback(original);
      return {
        status: 'resolved',
        message: canonical,
        intent: stringValue(body.intent),
        module: stringValue(body.module),
        confidence: numberValue(body.confidence),
        clarification: '',
        entities: semanticEntities(body.entities),
      };
    }
    if (status === 'none') {
      return {
        status: 'none',
        message: original,
        intent: '',
        module: '',
        confidence: 0,
        clarification: '',
        entities: [],
      };
    }

    return fallback(original);
  } catch {
    return fallback(original);
  } finally {
    clearTimeout(timeout);
  }
}

function fallback(message: string): SemanticMessageResult {
  return {
    status: 'fallback',
    message,
    intent: '',
    module: '',
    confidence: 0,
    clarification: '',
    entities: [],
  };
}

function semanticEntities(value: unknown): SemanticMessageEntity[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      type: stringValue(entry.type),
      value: stringValue(entry.value),
      raw: stringValue(entry.raw),
      confidence: numberValue(entry.confidence),
    }))
    .filter((entry) => entry.type !== '' && entry.value !== '');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
