export type ConversationChannel = 'internal' | 'whatsapp';
export type ConversationStatePayload = Record<string, unknown>;

export type ConversationEntityPayload = {
  id: string;
  type: string;
  label: string;
  index?: number;
  metadata?: Record<string, unknown>;
};

export type ConversationResolutionPayload = {
  status: 'inactive' | 'expired' | 'reset' | 'route' | 'reply' | 'selected' | 'pending_action' | 'confirm' | 'reject';
  reason: string;
  message: string;
  reply: string;
  state: ConversationStatePayload;
  selectedEntity: ConversationEntityPayload | null;
  pendingAction: Record<string, unknown> | null;
  diagnostics?: {
    rawMessage: string;
    sessionActive: boolean;
    pendingAction: string;
    currentTopic: string;
    resolvedIntent: string;
    contextUsed: boolean;
    referencedEntity: { type: string; id: string } | null;
    confidence: number;
  };
};

export type ConversationMemoryResult = {
  ok: boolean;
  error: string;
  result: ConversationResolutionPayload | null;
};

export type ConversationEffectPayload = {
  intent?: string;
  topic?: string;
  filters?: Record<string, string | number | boolean>;
  recentEntities?: ConversationEntityPayload[];
  lastCreatedEntity?: ConversationEntityPayload | null;
  pendingAction?: Record<string, unknown> | null;
  pendingSelection?: Record<string, unknown> | null;
  pendingQuestion?: Record<string, unknown> | null;
};

type ResolveOptions = {
  url: string;
  token: string;
  timeoutMs: number;
  channel: ConversationChannel;
  userId: string;
  conversationId: string;
  sessionId: string;
  state: ConversationStatePayload | null;
  fetchImpl?: typeof fetch;
};

type ResolverResponse = {
  ok?: boolean;
  result?: unknown;
};

type EffectResponse = {
  ok?: boolean;
  state?: unknown;
};

export async function resolveConversationMemory(
  message: string,
  options: ResolveOptions,
): Promise<ConversationMemoryResult> {
  const original = String(message || '').trim();
  if (!original || !options.url || !options.token) return unavailable();

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
      body: JSON.stringify({
        message: original,
        channel: options.channel,
        user_id: options.userId,
        conversation_id: options.conversationId,
        session_id: options.sessionId,
        state: options.state,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as ResolverResponse | null;
    if (!response.ok || !body || body.ok !== true || !isResolution(body.result)) return unavailable();
    return { ok: true, error: '', result: body.result };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

export async function applyConversationMemoryEffect(
  effect: ConversationEffectPayload,
  options: Omit<ResolveOptions, 'fetchImpl'> & { fetchImpl?: typeof fetch },
): Promise<{ ok: boolean; state: ConversationStatePayload | null }> {
  if (!options.url || !options.token || !options.state) return { ok: false, state: null };
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
      body: JSON.stringify({
        channel: options.channel,
        user_id: options.userId,
        conversation_id: options.conversationId,
        session_id: options.sessionId,
        state: options.state,
        effect,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as EffectResponse | null;
    return response.ok && body?.ok === true && isRecord(body.state)
      ? { ok: true, state: body.state }
      : { ok: false, state: null };
  } catch {
    return { ok: false, state: null };
  } finally {
    clearTimeout(timeout);
  }
}

function isResolution(value: unknown): value is ConversationResolutionPayload {
  if (!isRecord(value) || !isRecord(value.state)) return false;
  const status = text(value.status);
  return [
    'inactive', 'expired', 'reset', 'route', 'reply', 'selected',
    'pending_action', 'confirm', 'reject',
  ].includes(status);
}

function unavailable(): ConversationMemoryResult {
  return { ok: false, error: 'conversation_resolver_unavailable', result: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
