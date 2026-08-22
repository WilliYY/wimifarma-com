import { interpretSemanticCommand, type SemanticChannel, type SemanticInterpretation } from './semantic-command.js';

export type ConversationIdentity = {
  channel: SemanticChannel;
  userId: string;
  conversationId: string;
  sessionId: string;
};

export type ConversationEntity = {
  index: number;
  type: string;
  id: string;
  label: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ConversationPendingAction = {
  id: string;
  intent: string;
  entity: ConversationEntity | null;
  createdAt: string;
  expiresAt: string;
};

export type ConversationPendingSelection = {
  intent: string;
  entities: ConversationEntity[];
  createdAt: string;
  expiresAt: string;
};

export type ConversationPendingQuestion = {
  key: string;
  prompt: string;
  createdAt: string;
  expiresAt: string;
};

export type MiaubyConversationState = ConversationIdentity & {
  version: 1;
  revision: number;
  active: boolean;
  currentTopic: string;
  lastIntent: string;
  lastFilters: Record<string, string | number | boolean>;
  recentEntities: ConversationEntity[];
  lastCreatedEntity: ConversationEntity | null;
  pendingAction: ConversationPendingAction | null;
  pendingSelection: ConversationPendingSelection | null;
  pendingQuestion: ConversationPendingQuestion | null;
  lastInteractionAt: string;
  expiresAt: string;
};

export type ConversationEffect = {
  intent?: string;
  topic?: string;
  filters?: Record<string, string | number | boolean>;
  recentEntities?: ConversationEntity[];
  lastCreatedEntity?: ConversationEntity | null;
  pendingAction?: ConversationPendingAction | null;
  pendingSelection?: ConversationPendingSelection | null;
  pendingQuestion?: ConversationPendingQuestion | null;
};

export type ConversationResolutionStatus =
  | 'inactive'
  | 'expired'
  | 'reset'
  | 'route'
  | 'reply'
  | 'selected'
  | 'pending_action'
  | 'confirm'
  | 'reject';

export type ConversationResolution = {
  status: ConversationResolutionStatus;
  reason: string;
  message: string;
  reply: string;
  state: MiaubyConversationState;
  selectedEntity: ConversationEntity | null;
  pendingAction: ConversationPendingAction | null;
  semantic: SemanticInterpretation;
};

export type ResolveConversationOptions = ConversationIdentity & {
  now?: Date;
  conversationTtlSeconds?: number;
  pendingActionTtlSeconds?: number;
};

const DEFAULT_CONVERSATION_TTL_SECONDS = 30 * 60;
const DEFAULT_PENDING_ACTION_TTL_SECONDS = 5 * 60;
const MAX_RECENT_ENTITIES = 20;
const RESET_PATTERN = /^(?:miauby\s+)?(?:encerra(?:\s+(?:a\s+)?conversa)?|sair\s+do\s+miauby|limpa(?:r)?\s+(?:o\s+)?contexto)$/u;
const CONFIRM_PATTERN = /^(?:sim|s|ss|pode|pode\s+sim|confirmo|confirma|isso|isso\s+mesmo|beleza|blz|ok|faz|manda|vai)$/u;
const REJECT_PATTERN = /^(?:nao|n|deixa|deixa\s+quieto|nao\s+precisa|cancela|esquece|melhor\s+nao)$/u;
const CANCEL_REFERENCE_PATTERN = /\b(?:cancela|cancelar|remove|remover|exclui|excluir)\b/u;
const REFERENCE_PATTERN = /\b(?:esse|essa|ele|ela|isso|esse\s+ai|essa\s+ai)\b/u;
const ENCOMENDA_READ_PATTERN = /\b(?:encomenda|encomendas)\b/u;
const ENCOMENDA_READ_CUE = /\b(?:qual|quais|lista|listar|mostra|mostrar|ver|veja|consulta|consultar|tem|ha|existe)\b/u;

export function emptyConversationState(
  identity: ConversationIdentity,
  now = new Date(),
  ttlSeconds = DEFAULT_CONVERSATION_TTL_SECONDS,
): MiaubyConversationState {
  const instant = validDate(now);
  return {
    version: 1,
    revision: 0,
    active: true,
    channel: identity.channel,
    userId: cleanIdentity(identity.userId),
    conversationId: cleanIdentity(identity.conversationId),
    sessionId: cleanIdentity(identity.sessionId),
    currentTopic: '',
    lastIntent: '',
    lastFilters: {},
    recentEntities: [],
    lastCreatedEntity: null,
    pendingAction: null,
    pendingSelection: null,
    pendingQuestion: null,
    lastInteractionAt: instant.toISOString(),
    expiresAt: addSeconds(instant, ttlSeconds).toISOString(),
  };
}

export function resolveConversationMessage(
  message: string,
  inputState: MiaubyConversationState | null,
  options: ResolveConversationOptions,
): ConversationResolution {
  const original = String(message || '').trim();
  const now = validDate(options.now || new Date());
  const conversationTtl = positiveTtl(options.conversationTtlSeconds, DEFAULT_CONVERSATION_TTL_SECONDS);
  const pendingTtl = Math.min(
    positiveTtl(options.pendingActionTtlSeconds, DEFAULT_PENDING_ACTION_TTL_SECONDS),
    conversationTtl,
  );
  const identity: ConversationIdentity = {
    channel: options.channel,
    userId: cleanIdentity(options.userId),
    conversationId: cleanIdentity(options.conversationId),
    sessionId: cleanIdentity(options.sessionId),
  };
  const normalized = normalize(original);
  const wake = hasWakeWord(original);
  const initialExplicit = explicitInterpretation(original, options.channel);
  const canActivateInternalWithoutWake = identity.channel === 'internal'
    && (isEncomendaRead(normalized) || initialExplicit.status !== 'none');
  const stateMatches = stateBelongsTo(inputState, identity);
  const expired = Boolean(stateMatches && isExpired(inputState?.expiresAt, now));
  let state = stateMatches && !expired
    ? sanitizeState(inputState as MiaubyConversationState, identity, now, conversationTtl)
    : inactiveState(identity, now);

  if (RESET_PATTERN.test(normalized)) {
    state = inactiveState(identity, now, state.revision + 1);
    return resolution('reset', 'explicit_reset', original, 'Conversa encerrada. Contexto limpo.', state);
  }

  if (expired && !wake && !canActivateInternalWithoutWake) {
    return resolution(
      'expired',
      'conversation_expired',
      original,
      'O contexto anterior expirou. Chame Miauby e diga novamente o que precisa.',
      state,
    );
  }

  if (!state.active && !wake && !canActivateInternalWithoutWake) {
    return resolution('inactive', 'wake_word_required', original, '', state);
  }

  if (!state.active) {
    state = emptyConversationState(identity, now, conversationTtl);
  }

  const pendingAction = validPendingAction(state.pendingAction, now);
  if (state.pendingAction && !pendingAction) {
    state = touch({ ...state, pendingAction: null }, now, conversationTtl);
  }
  if (pendingAction) {
    if (CONFIRM_PATTERN.test(normalized)) {
      state = touch({ ...state, pendingAction: null }, now, conversationTtl);
      return resolution('confirm', 'pending_action_confirmed', original, '', state, null, pendingAction);
    }
    if (REJECT_PATTERN.test(normalized)) {
      state = touch({ ...state, pendingAction: null }, now, conversationTtl);
      return resolution('reject', 'pending_action_rejected', original, 'Cancelado. Nenhuma acao foi executada.', state, null, pendingAction);
    }
    return resolution(
      'reply',
      'pending_action_waiting',
      original,
      'Existe uma acao pendente. Confirme ou cancele antes de continuar.',
      state,
      null,
      pendingAction,
    );
  }

  if (isEncomendaRead(normalized)) {
    state = touch({ ...state, currentTopic: 'encomendas', lastIntent: 'consultar_encomendas' }, now, conversationTtl);
    const order = /\b(?:recente|recentes|nova|novas|ultima|ultimas)\b/.test(normalized) ? ' recentes' : '';
    return resolution('route', 'explicit_encomenda_read', `Miauby listar encomendas${order}`, '', state);
  }

  const explicit = initialExplicit;
  if (explicit.status === 'blocked' || explicit.status === 'ambiguous') {
    state = touch(state, now, conversationTtl);
    return resolution('reply', `semantic_${explicit.status}`, original, explicit.clarification, state, null, null, explicit);
  }
  if (explicit.status === 'resolved') {
    state = applySemantic(state, explicit, now, conversationTtl);
    return resolution('route', 'explicit_intent', explicit.canonical_message || original, '', state, null, null, explicit);
  }

  const pendingSelection = validPendingSelection(state.pendingSelection, now);
  if (state.pendingSelection && !pendingSelection) {
    state = touch({ ...state, pendingSelection: null }, now, conversationTtl);
  }
  const candidates = pendingSelection?.entities || state.recentEntities;
  const selected = selectRecentEntity(normalized, candidates)
    || (REFERENCE_PATTERN.test(normalized) ? sanitizeEntity(state.lastCreatedEntity) : null);
  if (selected) {
    if (CANCEL_REFERENCE_PATTERN.test(normalized)) {
      const pending: ConversationPendingAction = {
        id: `cancelar_encomenda:${selected.id}:${now.getTime()}`,
        intent: selected.type === 'encomenda' ? 'cancelar_encomenda' : `cancelar_${selected.type}`,
        entity: selected,
        createdAt: now.toISOString(),
        expiresAt: addSeconds(now, pendingTtl).toISOString(),
      };
      state = touch({ ...state, pendingAction: pending }, now, conversationTtl);
      return resolution(
        'pending_action',
        'referenced_action_requires_confirmation',
        original,
        `Deseja cancelar ${selected.label}?`,
        state,
        selected,
        pending,
      );
    }
    state = touch({ ...state, lastCreatedEntity: selected, pendingSelection: null }, now, conversationTtl);
    return resolution('selected', 'recent_entity_selected', original, selected.label, state, selected);
  }

  const pendingQuestion = validPendingQuestion(state.pendingQuestion, now);
  if (state.pendingQuestion && !pendingQuestion) {
    state = touch({ ...state, pendingQuestion: null }, now, conversationTtl);
  } else if (pendingQuestion) {
    state = touch({ ...state, pendingQuestion: null }, now, conversationTtl);
    return resolution('route', 'pending_question_answered', original, '', state);
  }

  if (state.currentTopic === 'falteiro' && state.lastIntent === 'registrar_falteiro') {
    const product = continuationProduct(original);
    if (product) {
      const rewritten = `Miauby falta ${product}`;
      const semantic = interpretSemanticCommand(rewritten, { channel: options.channel });
      state = semantic.status === 'resolved'
        ? applySemantic(state, semantic, now, conversationTtl)
        : touch(state, now, conversationTtl);
      return resolution('route', 'topic_continuation', semantic.canonical_message || rewritten, '', state, null, null, semantic);
    }
  }

  state = touch(state, now, conversationTtl);
  return resolution('route', 'active_conversation', original, '', state);
}

export function applyConversationEffect(
  inputState: MiaubyConversationState,
  effect: ConversationEffect,
  now = new Date(),
  ttlSeconds = DEFAULT_CONVERSATION_TTL_SECONDS,
): MiaubyConversationState {
  const state = sanitizeState(inputState, inputState, validDate(now), ttlSeconds);
  const recentEntities = effect.recentEntities === undefined
    ? state.recentEntities
    : sanitizeEntities(effect.recentEntities);
  return touch({
    ...state,
    currentTopic: cleanText(effect.topic, 80) || state.currentTopic,
    lastIntent: cleanText(effect.intent, 100) || state.lastIntent,
    lastFilters: effect.filters === undefined ? state.lastFilters : sanitizeFilters(effect.filters),
    recentEntities,
    lastCreatedEntity: effect.lastCreatedEntity === undefined
      ? state.lastCreatedEntity
      : sanitizeEntity(effect.lastCreatedEntity),
    pendingAction: effect.pendingAction === undefined ? state.pendingAction : effect.pendingAction,
    pendingSelection: effect.pendingSelection === undefined ? state.pendingSelection : effect.pendingSelection,
    pendingQuestion: effect.pendingQuestion === undefined ? state.pendingQuestion : effect.pendingQuestion,
  }, validDate(now), ttlSeconds);
}

function explicitInterpretation(message: string, channel: SemanticChannel): SemanticInterpretation {
  return interpretSemanticCommand(message, { channel });
}

function applySemantic(
  state: MiaubyConversationState,
  semantic: SemanticInterpretation,
  now: Date,
  ttlSeconds: number,
): MiaubyConversationState {
  return touch({
    ...state,
    currentTopic: topicFor(semantic.intent, semantic.module),
    lastIntent: semantic.intent,
    lastFilters: Object.fromEntries(semantic.entities.map((entity) => [entity.type, entity.value])),
    pendingSelection: null,
    pendingQuestion: null,
  }, now, ttlSeconds);
}

function topicFor(intent: string, module: string): string {
  if (intent === 'registrar_falteiro') return 'falteiro';
  if (intent.includes('encomenda')) return 'encomendas';
  return cleanText(module || intent, 80);
}

function selectRecentEntity(normalized: string, entities: ConversationEntity[]): ConversationEntity | null {
  if (!entities.length) return null;
  if (/\b(?:ultimo|ultima)\b/u.test(normalized)) return entities[entities.length - 1] || null;
  const position = selectionIndex(normalized);
  if (position > 0) return entities.find((entity) => entity.index === position) || null;

  const contentTerms = normalized
    .replace(CANCEL_REFERENCE_PATTERN, ' ')
    .replace(REFERENCE_PATTERN, ' ')
    .replace(/\b(?:qual|quais|e|a|o|da|de|do|pra|para)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((term) => term.length >= 3);
  if (contentTerms.length) {
    const matches = entities.filter((entity) => {
      const label = normalize(entity.label);
      return contentTerms.every((term) => label.includes(term));
    });
    if (matches.length === 1) return matches[0];
  }
  if (REFERENCE_PATTERN.test(normalized) && entities.length === 1) return entities[0];
  return null;
}

function selectionIndex(normalized: string): number {
  const direct = normalized.match(/^(?:o|a)?\s*(\d{1,2})$/);
  if (direct) return Number(direct[1]);
  const ordinals: Array<[RegExp, number]> = [
    [/\b(?:primeiro|primeira)\b/, 1],
    [/\b(?:segundo|segunda)\b/, 2],
    [/\b(?:terceiro|terceira)\b/, 3],
  ];
  for (const [pattern, index] of ordinals) if (pattern.test(normalized)) return index;
  return 0;
}

function continuationProduct(message: string): string {
  const normalized = normalize(message);
  if (!/\b(?:tambem|mais)\b/.test(normalized)) return '';
  return String(message || '')
    .replace(/\b(?:tamb[eé]m|mais)\b/giu, ' ')
    .replace(/^\s*(?:e\s+)?/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEncomendaRead(normalized: string): boolean {
  return ENCOMENDA_READ_PATTERN.test(normalized) && ENCOMENDA_READ_CUE.test(normalized)
    && !/\b(?:cria|criar|nova|novo|adiciona|registrar|encomendar)\b/.test(normalized);
}

function validPendingAction(value: ConversationPendingAction | null, now: Date): ConversationPendingAction | null {
  if (!value || isExpired(value.expiresAt, now)) return null;
  return value;
}

function validPendingSelection(value: ConversationPendingSelection | null, now: Date): ConversationPendingSelection | null {
  if (!value || isExpired(value.expiresAt, now) || !Array.isArray(value.entities) || value.entities.length === 0) return null;
  return value;
}

function validPendingQuestion(value: ConversationPendingQuestion | null, now: Date): ConversationPendingQuestion | null {
  if (!value || isExpired(value.expiresAt, now) || !cleanText(value.key, 100)) return null;
  return value;
}

function stateBelongsTo(state: MiaubyConversationState | null, identity: ConversationIdentity): boolean {
  return Boolean(state
    && state.channel === identity.channel
    && cleanIdentity(state.userId) === cleanIdentity(identity.userId)
    && cleanIdentity(state.conversationId) === cleanIdentity(identity.conversationId)
    && cleanIdentity(state.sessionId) === cleanIdentity(identity.sessionId));
}

function sanitizeState(
  state: MiaubyConversationState,
  identity: ConversationIdentity,
  now: Date,
  ttlSeconds: number,
): MiaubyConversationState {
  return {
    ...emptyConversationState(identity, now, ttlSeconds),
    version: 1,
    revision: Math.max(0, Math.trunc(Number(state.revision) || 0)),
    active: state.active === true,
    currentTopic: cleanText(state.currentTopic, 80),
    lastIntent: cleanText(state.lastIntent, 100),
    lastFilters: sanitizeFilters(state.lastFilters),
    recentEntities: sanitizeEntities(state.recentEntities),
    lastCreatedEntity: sanitizeEntity(state.lastCreatedEntity),
    pendingAction: state.pendingAction || null,
    pendingSelection: state.pendingSelection || null,
    pendingQuestion: state.pendingQuestion || null,
    lastInteractionAt: validIso(state.lastInteractionAt, now.toISOString()),
    expiresAt: validIso(state.expiresAt, addSeconds(now, ttlSeconds).toISOString()),
  };
}

function touch(state: MiaubyConversationState, now: Date, ttlSeconds: number): MiaubyConversationState {
  return {
    ...state,
    active: true,
    revision: state.revision + 1,
    lastInteractionAt: now.toISOString(),
    expiresAt: addSeconds(now, positiveTtl(ttlSeconds, DEFAULT_CONVERSATION_TTL_SECONDS)).toISOString(),
  };
}

function inactiveState(identity: ConversationIdentity, now: Date, revision = 0): MiaubyConversationState {
  return {
    ...emptyConversationState(identity, now, 1),
    active: false,
    revision,
    expiresAt: now.toISOString(),
  };
}

function resolution(
  status: ConversationResolutionStatus,
  reason: string,
  message: string,
  reply: string,
  state: MiaubyConversationState,
  selectedEntity: ConversationEntity | null = null,
  pendingAction: ConversationPendingAction | null = null,
  semantic: SemanticInterpretation = emptySemantic(),
): ConversationResolution {
  return { status, reason, message, reply, state, selectedEntity, pendingAction, semantic };
}

function sanitizeEntities(values: ConversationEntity[] | undefined): ConversationEntity[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_RECENT_ENTITIES).map((value, offset) => sanitizeEntity(value, offset + 1)).filter(Boolean) as ConversationEntity[];
}

function sanitizeEntity(value: ConversationEntity | null | undefined, fallbackIndex = 1): ConversationEntity | null {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id, 160);
  const type = cleanText(value.type, 60);
  const label = cleanText(value.label, 240);
  if (!id || !type || !label) return null;
  return {
    index: Math.max(1, Math.trunc(Number(value.index) || fallbackIndex)),
    type,
    id,
    label,
    ...(value.metadata && typeof value.metadata === 'object' ? { metadata: value.metadata } : {}),
  };
}

function sanitizeFilters(value: Record<string, string | number | boolean> | undefined): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value).slice(0, 20).flatMap(([key, item]) => {
    const cleanKey = cleanText(key, 60);
    if (!cleanKey || !['string', 'number', 'boolean'].includes(typeof item)) return [];
    return [[cleanKey, typeof item === 'string' ? cleanText(item, 240) : item] as const];
  });
  return Object.fromEntries(entries);
}

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWakeWord(value: string): boolean {
  return /^\s*(?:miauby|miauw|miau)\b/iu.test(String(value || ''));
}

function ensureWake(value: string): string {
  return hasWakeWord(value) ? value : `Miauby ${String(value || '').trim()}`;
}

function cleanIdentity(value: string): string {
  return cleanText(value, 160);
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validDate(value: Date): Date {
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function validIso(value: string, fallback: string): string {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function isExpired(value: string | undefined, now: Date): boolean {
  const parsed = Date.parse(String(value || ''));
  return !Number.isFinite(parsed) || parsed <= now.getTime();
}

function addSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() + positiveTtl(seconds, 1) * 1000);
}

function positiveTtl(value: number | undefined, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptySemantic(): SemanticInterpretation {
  return {
    status: 'none',
    intent: '',
    module: '',
    risk: 'baixo',
    confidence: 0,
    evidence: [],
    entities: [],
    canonical_message: '',
    missing: [],
    clarification: '',
  };
}
