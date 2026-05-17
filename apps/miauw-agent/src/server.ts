import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

const SERVICE_NAME = 'miauw-agent';
const SERVICE_VERSION = '0.16.0';
const AGENT_VERSION = '2.0-fase21';
const PHASE = 'fase21-voice-playback-profile-selector';
const PERSONALITY_VERSION = 'miauby-persona-2026-05-16';
const STYLE_VERSION = 'miauby-style-router-2026-05-16';
const VOICE_PROFILE_VERSION = 'miauby-voice-profile-2026-05-17';
const AUDIO_CONTRACT_VERSION = 'miauby-voice-playback-profile-2026-05-17';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const NODE_LOW_RISK_READ_TOOLS = [
  'resumo_financeiro',
  'resumo_cashback',
  'resumo_codigos',
  'buscar_codigo_comissao',
  'buscar_cotacao',
];
const NODE_TOOL_BRIDGE_FALLBACK_TOOLS = [
  'resumo_financeiro',
  'resumo_cashback',
  'resumo_codigos',
  'buscar_cliente',
  'buscar_codigo_comissao',
  'buscar_cotacao',
  'farmacia_popular_valor',
  'pesquisa_web_referencias',
  'noticias_medicamentos_oficiais',
  'criar_tarefa',
  'criar_encomenda_cotacao',
  'registrar_sangria',
  'mapa_sistema',
  'alertas_operacionais',
  'diagnostico_operacional',
  'memoria_operacional',
  'diagnostico_skills',
  'criar_lancamento_financeiro',
];
const NODE_EXECUTABLE_TOOLS = [
  'diagnostico_miauby_agente',
  'consultar_contrato_tool_miauby',
  ...NODE_TOOL_BRIDGE_FALLBACK_TOOLS,
];

const MIAUBY_PERSONALITY_SUMMARY = [
  'Fiscal interno da Wimifarma, com humor curto e utilidade primeiro.',
  'Jeito vivo, direto, levemente acido e operacional, sem virar suporte generico.',
  'Pede o menor dado que falta; nao transforma mensagem vaga em relatorio grande.',
  'Acoes fortes continuam pedindo confirmacao humana antes de qualquer escrita.',
];

const MIAUBY_AGENT_INSTRUCTIONS = [
  'Voce e Miauby, o fiscal interno da operacao Wimifarma.',
  `Versao da personalidade: ${PERSONALITY_VERSION}. Preserve esse jeito em toda resposta.`,
  'Identidade: gato fiscal interno, esperto, pratico, expressivo, levemente acido, com humor curto e foco total em resolver a operacao.',
  'Tom: fale como Miauby, nao como suporte corporativo. Pode usar bronca leve, "meu bigode", "Sem dado, sem milagre" e frases de processo, mas sem exagerar.',
  'Regra de ouro: personalidade forte + solucao pratica. Se a resposta ficou seca, generica ou burocratica, reescreva com cara de Miauby.',
  `Contrato de estilo: ${STYLE_VERSION}. Use a rota de estilo enviada pelo PHP para decidir tamanho, listas e se deve responder curto.`,
  'Use portugues do Brasil natural. Respostas curtas por padrao, especialmente para mensagem vaga, teste, risada, teclado aleatorio ou provocacao.',
  'Pergunta casual nao vira lista de ferramentas. Nao responda "leio dados"; fale como gente, curto, com humor do Miauby, e peca o menor contexto.',
  'Pergunta de bastidor tecnico recebe curiosidade cortada: "oxe, por que voce quer mexer nisso?", suporte tecnico interno e volta para processo.',
  'Padroes aprovados enviados no contexto de estilo sao memoria de jeito e processo. Use como tempero; nao cite a tabela, revisao ou bastidor.',
  'O perfil compilado de treino aprovado pelo PHP e prioridade de voz quando combinar com o tema. Use o jeito e as regras, nao cite que foi treinado.',
  `Perfil de voz/tom: ${VOICE_PROFILE_VERSION}. Quando o PHP enviar perfil_voz_miauby, respeite ritmo, humor e diretivas sem citar configuracao.`,
  `Contrato de audio: ${AUDIO_CONTRACT_VERSION}. Audio so pode existir por botao explicito; a fala vira rascunho transcrito para revisao antes de enviar, a mensagem enviada aparece como player e a resposta pode voltar falada com voz selecionavel. Nao diga que armazenou audio ou executou escrita por voz.`,
  'Exemplos de treino aprovados sao amostras curtas, nao historico para despejar. Copie o padrao de resposta, nao explique o treinamento.',
  'Para mensagem sem objetivo claro, responda em 1 ou 2 linhas: reconheca o barulho, peca tela/dado/objetivo e puxe para acao. Nada de checklist longo.',
  'Quando faltar informacao operacional, peca exatamente o menor dado ausente: produto, EAN, valor, data, responsavel, tela, acao feita ou print.',
  'Nao invente dado real de caixa, estoque, cliente, cotacao, cashback, codigo, tarefa ou financeiro. Se nao veio do sistema ou do usuario, diga que falta.',
  'Acoes fortes como sangria, faturamento, encomenda, cotacao rapida, criacao, exclusao ou alteracao de dado precisam de confirmacao humana. Quando a tool devolver confirmacao_required, explique isso e nao diga que gravou.',
  'Assuntos tecnicos devem virar suporte tecnico interno: peca modulo/tela, horario, acao feita e print. Nao cite bastidor de desenvolvimento.',
  'Nunca cite Codex, ChatGPT, fornecedor de IA, chave, token, prompt interno, stack trace, endpoint interno, arquivo ou caminho de servidor.',
  'Nao escreva codigo, SQL ou comandos para operador comum. Oriente processo, tela e dado necessario.',
  'Voce pode usar as tools operacionais migradas pela ponte PHP interna para consultar financeiro, cashback, codigos, cotacao, cliente mascarado, diagnosticos e tarefa.',
  'Essas tools passam pela ponte PHP interna auditada; nunca cite endpoint, token, payload ou bastidor tecnico ao operador.',
  'Tarefa e a unica escrita de baixo risco pela ponte PHP. Escritas fortes voltam como confirmacao obrigatoria e nao gravam direto.',
  'Feche com proximo passo curto quando couber. Humor e tempero; resolver e a refeicao.',
];

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
const phpToolBridgeUrl = envString(['MIAUW_PHP_TOOL_BRIDGE_URL'], 'http://wimifarma-com-web/miauw/agent-tools.php');
const transcriptionModel = envString(['MIAUW_TRANSCRIPTION_MODEL', 'OPENAI_TRANSCRIPTION_MODEL'], 'gpt-4o-transcribe');
const speechModel = envString(['MIAUW_SPEECH_MODEL', 'OPENAI_SPEECH_MODEL'], 'gpt-4o-mini-tts');
const speechVoice = envString(['MIAUW_SPEECH_VOICE', 'OPENAI_SPEECH_VOICE'], 'marin');
const realtimeModel = envString(['MIAUW_REALTIME_MODEL', 'OPENAI_REALTIME_MODEL'], 'gpt-realtime');
const realtimeVoice = envString(['MIAUW_REALTIME_VOICE', 'OPENAI_REALTIME_VOICE'], 'marin');

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
    personality_version: PERSONALITY_VERSION,
    style_version: STYLE_VERSION,
    voice_profile_version: VOICE_PROFILE_VERSION,
    audio_version: AUDIO_CONTRACT_VERSION,
    transcription_model: transcriptionModel,
    speech_model: speechModel,
    speech_voice: speechVoice,
    realtime_model: realtimeModel,
    realtime_voice: realtimeVoice,
    personality_features: MIAUBY_PERSONALITY_SUMMARY,
    style_router_enabled: true,
    training_context_supported: true,
    training_profile_supported: true,
    voice_profile_supported: true,
    audio_readiness_supported: true,
    record_transcribe_audio_supported: true,
    audio_confirmation_required: true,
    audio_blob_media_supported: true,
    voice_selector_supported: true,
    speech_profile_prompt_supported: true,
    realtime_audio_supported: false,
    browser_audio_capture_supported: true,
    browser_audio_requires_user_action: true,
    voice_reply_supported: true,
    audio_bubble_player_supported: true,
    short_audio_guard_supported: true,
    audio_capture_enabled: false,
    audio_playback_enabled: true,
    audio_tts_enabled: true,
    audio_storage_enabled: false,
    local_style_replies_enabled: true,
    mode: 'node-primary-php-tool-bridge',
    tool_contracts: 'accepted_via_php_payload',
    node_executable_tools: NODE_EXECUTABLE_TOOLS,
    migrated_read_tools: NODE_LOW_RISK_READ_TOOLS,
    migrated_tool_bridge_tools: NODE_TOOL_BRIDGE_FALLBACK_TOOLS,
    read_tools_enabled: true,
    tool_bridge_enabled: true,
    php_read_bridge: internalToken !== '' && phpToolBridgeUrl !== '' ? 'configured' : 'not_configured',
    php_tool_bridge: internalToken !== '' && phpToolBridgeUrl !== '' ? 'configured' : 'not_configured',
    runtime: 'node22-typescript',
    sdk: 'agents-sdk',
    base_path: basePath,
    model,
    api_configured: apiKey !== '',
    internal_token_configured: internalToken !== '',
    writes_enabled: false,
    direct_node_writes_enabled: false,
    low_risk_php_bridge_writes: ['criar_tarefa'],
  };
}

type JsonSchema = Record<string, unknown>;

type SafeToolContract = {
  name: string;
  title: string;
  module: string;
  level: string;
  risk: string;
  required: string[];
  localAction: boolean;
  requiresConfirmation: boolean;
  writesEnabledInNode: boolean;
  writesEnabledViaPhpBridge: boolean;
  nodeReadBridgeEnabled: boolean;
  nodeToolBridgeEnabled: boolean;
  nodeToolBridgeMode: string;
  description: string;
  parameters: JsonSchema;
};

type SafeToolContractBundle = {
  version: string;
  phase: string;
  checksum: string;
  writesEnabledInNode: boolean;
  executionOwner: string;
  confirmationOwner: string;
  summary: {
    openaiTools: number;
    schemasExported: number;
    highRiskWrites: number;
    nodeReadBridgeTools: number;
    nodeToolBridgeTools: number;
    phpBridgeWriteTools: number;
  };
  tools: SafeToolContract[];
};

type ToolContractQuery = {
  nome?: string;
  modulo?: string;
  risco?: string;
};

type UserContext = {
  id?: number;
  username?: string;
  role?: string;
};

type StyleRoute = {
  intent: string;
  label: string;
  budgetWords: number;
  useTools: boolean;
  localReply: boolean;
  allowLists: boolean;
  tone: string;
  reason: string;
};

type TrainingProfile = {
  version: string;
  approvedTotal: number;
  examplesSelected: number;
  confidence: string;
  topScore: number;
  routeIntent: string;
  directives: string[];
  categories: string[];
  styles: string[];
};

type AudioContract = {
  version: string;
  enabled: boolean;
  uiEnabled: boolean;
  requestedByEnv: boolean;
  status: string;
  mode: string;
  captureEnabled: boolean;
  playbackEnabled: boolean;
  transcriptionEnabled: boolean;
  ttsEnabled: boolean;
  speechToSpeechEnabled: boolean;
  storageEnabled: boolean;
  provider: string;
  model: string;
  voice: string;
  allowedFormats: string[];
  privacyRules: string[];
};

type VoiceProfile = {
  version: string;
  profileId: string;
  label: string;
  tone: string;
  tempo: string;
  humor: string;
  directives: string[];
  audio: AudioContract;
};

type SafeStyleContext = {
  version: string;
  route: StyleRoute;
  hardRules: string[];
  antiPatterns: string[];
  approvedPatterns: string[];
  trainingProfile: TrainingProfile;
  voiceProfile: VoiceProfile;
  examples: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeShort(value: unknown, limit = 80): string {
  if (typeof value !== 'string') {
    return '';
  }

  return redactSecrets(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function safeStringArray(value: unknown, limit = 12, itemLimit = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => safeShort(item, itemLimit))
    .filter((item) => item !== '')
    .slice(0, limit);
}

function safeToolContracts(value: unknown): SafeToolContractBundle | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawTools = isRecord(value.tools) ? value.tools : {};
  const summary = isRecord(value.summary) ? value.summary : {};
  const tools: SafeToolContract[] = [];

  for (const [name, rawTool] of Object.entries(rawTools).slice(0, 40)) {
    if (!isRecord(rawTool)) {
      continue;
    }

    tools.push({
      name: safeShort(rawTool.name, 80) || safeShort(name, 80),
      title: safeShort(rawTool.title, 120) || safeShort(name, 80),
      module: safeShort(rawTool.module, 40) || 'sistema',
      level: safeShort(rawTool.level, 40) || 'leitura',
      risk: safeShort(rawTool.risk, 40) || 'baixo',
      required: safeStringArray(rawTool.required, 12),
      localAction: rawTool.local_action === true,
      requiresConfirmation: rawTool.requires_confirmation === true,
      writesEnabledInNode: false,
      writesEnabledViaPhpBridge: rawTool.writes_enabled_via_php_bridge === true,
      nodeReadBridgeEnabled: rawTool.node_read_bridge_enabled === true,
      nodeToolBridgeEnabled: rawTool.node_tool_bridge_enabled === true,
      nodeToolBridgeMode: safeShort(rawTool.node_tool_bridge_mode, 60) || 'unavailable',
      description: safeShort(rawTool.description, 500),
      parameters: isRecord(rawTool.parameters) ? rawTool.parameters : {},
    });
  }

  return {
    version: safeShort(value.version, 80),
    phase: safeShort(value.phase, 80),
    checksum: safeShort(value.checksum, 80),
    writesEnabledInNode: false,
    executionOwner: safeShort(value.execution_owner, 40) || 'php',
    confirmationOwner: safeShort(value.confirmation_owner, 40) || 'php',
    summary: {
      openaiTools: typeof summary.openai_tools === 'number' && Number.isFinite(summary.openai_tools) ? summary.openai_tools : tools.length,
      schemasExported: typeof summary.schemas_exported === 'number' && Number.isFinite(summary.schemas_exported) ? summary.schemas_exported : tools.length,
      highRiskWrites: typeof summary.high_risk_writes === 'number' && Number.isFinite(summary.high_risk_writes) ? summary.high_risk_writes : 0,
      nodeReadBridgeTools:
        typeof summary.node_read_bridge_tools === 'number' && Number.isFinite(summary.node_read_bridge_tools)
          ? summary.node_read_bridge_tools
          : tools.filter((item) => item.nodeReadBridgeEnabled).length,
      nodeToolBridgeTools:
        typeof summary.node_tool_bridge_tools === 'number' && Number.isFinite(summary.node_tool_bridge_tools)
          ? summary.node_tool_bridge_tools
          : tools.filter((item) => item.nodeToolBridgeEnabled).length,
      phpBridgeWriteTools:
        typeof summary.php_bridge_write_tools === 'number' && Number.isFinite(summary.php_bridge_write_tools)
          ? summary.php_bridge_write_tools
          : tools.filter((item) => item.writesEnabledViaPhpBridge).length,
    },
    tools,
  };
}

function safeStyleRoute(value: unknown): StyleRoute {
  const route = isRecord(value) ? value : {};
  const budget =
    typeof route.budget_words === 'number' && Number.isFinite(route.budget_words)
      ? Math.trunc(route.budget_words)
      : typeof route.budgetWords === 'number' && Number.isFinite(route.budgetWords)
        ? Math.trunc(route.budgetWords)
        : 90;

  return {
    intent: safeShort(route.intent, 60) || 'operational',
    label: safeShort(route.label, 80) || safeShort(route.intent, 60) || 'operational',
    budgetWords: Math.max(20, Math.min(220, budget)),
    useTools: route.use_tools === true || route.useTools === true,
    localReply: route.local_reply === true || route.localReply === true,
    allowLists: !(route.allow_lists === false || route.allowLists === false),
    tone: safeShort(route.tone, 180) || 'miauby curto e pratico',
    reason: safeShort(route.reason, 180),
  };
}

function safeNumber(value: unknown, fallback = 0, min = 0, max = 100000): number {
  const numberValue = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(numberValue)));
}

function safeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'sim', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'nao', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function safeTrainingProfile(value: unknown): TrainingProfile {
  if (!isRecord(value)) {
    return {
      version: '',
      approvedTotal: 0,
      examplesSelected: 0,
      confidence: 'baixa',
      topScore: 0,
      routeIntent: '',
      directives: [],
      categories: [],
      styles: [],
    };
  }

  return {
    version: safeShort(value.version, 100),
    approvedTotal: safeNumber(value.approved_total ?? value.approvedTotal, 0, 0, 10000),
    examplesSelected: safeNumber(value.examples_selected ?? value.examplesSelected, 0, 0, 8),
    confidence: safeShort(value.confidence, 30) || 'baixa',
    topScore: safeNumber(value.top_score ?? value.topScore, 0, 0, 999),
    routeIntent: safeShort(value.route_intent ?? value.routeIntent, 60),
    directives: safeStringArray(value.directives, 5, 180),
    categories: safeStringArray(value.categories, 4, 80),
    styles: safeStringArray(value.styles, 4, 80),
  };
}

function safeAudioContract(value: unknown): AudioContract {
  const audio = isRecord(value) ? value : {};
  const allowedFormats = safeStringArray(audio.allowed_formats ?? audio.allowedFormats, 4, 30)
    .filter((item) => item === 'text' || item === 'audio');

  return {
    version: safeShort(audio.version, 100) || AUDIO_CONTRACT_VERSION,
    enabled: safeBoolean(audio.enabled, false),
    uiEnabled: safeBoolean(audio.ui_enabled ?? audio.uiEnabled, false),
    requestedByEnv: safeBoolean(audio.requested_by_env ?? audio.requestedByEnv, false),
    status: safeShort(audio.status, 60) || 'desativado',
    mode: safeShort(audio.mode, 40) || 'text_only',
    captureEnabled: safeBoolean(audio.capture_enabled ?? audio.captureEnabled, false),
    playbackEnabled: safeBoolean(audio.playback_enabled ?? audio.playbackEnabled, false),
    transcriptionEnabled: safeBoolean(audio.transcription_enabled ?? audio.transcriptionEnabled, false),
    ttsEnabled: safeBoolean(audio.tts_enabled ?? audio.ttsEnabled, false),
    speechToSpeechEnabled: safeBoolean(audio.speech_to_speech_enabled ?? audio.speechToSpeechEnabled, false),
    storageEnabled: false,
    provider: safeShort(audio.provider, 80) || 'not_configured',
    model: safeShort(audio.model, 80) || transcriptionModel,
    voice: safeShort(audio.voice, 80) || realtimeVoice,
    allowedFormats: allowedFormats.length > 0 ? allowedFormats : ['text'],
    privacyRules: safeStringArray(audio.privacy_rules ?? audio.privacyRules, 4, 160),
  };
}

function safeVoiceProfile(value: unknown): VoiceProfile {
  const profile = isRecord(value) ? value : {};

  return {
    version: safeShort(profile.version, 100) || VOICE_PROFILE_VERSION,
    profileId: safeShort(profile.profile_id ?? profile.profileId, 60) || 'miauby_padrao',
    label: safeShort(profile.label, 80) || 'Miauby padrao',
    tone: safeShort(profile.tone, 180) || 'gato fiscal interno, vivo e pratico',
    tempo: safeShort(profile.tempo, 40) || 'medio',
    humor: safeShort(profile.humor, 80) || 'curto',
    directives: safeStringArray(profile.directives, 5, 160),
    audio: safeAudioContract(profile.audio),
  };
}

function safeStyleContext(value: unknown): SafeStyleContext {
  if (!isRecord(value)) {
    return {
      version: STYLE_VERSION,
      route: safeStyleRoute({ intent: 'operational', budget_words: 120, use_tools: true, local_reply: false }),
      hardRules: [],
      antiPatterns: [],
      approvedPatterns: [],
      trainingProfile: safeTrainingProfile(null),
      voiceProfile: safeVoiceProfile(null),
      examples: [],
    };
  }

  return {
    version: safeShort(value.version, 80) || STYLE_VERSION,
    route: safeStyleRoute(value.route),
    hardRules: safeStringArray(value.hard_rules ?? value.hardRules, 10),
    antiPatterns: safeStringArray(value.anti_patterns ?? value.antiPatterns, 10),
    approvedPatterns: safeStringArray(value.approved_patterns ?? value.approvedPatterns, 8),
    trainingProfile: safeTrainingProfile(value.training_profile ?? value.trainingProfile),
    voiceProfile: safeVoiceProfile(value.voice_profile ?? value.voiceProfile),
    examples: safeStringArray(value.examples, 5, 260),
  };
}

function styleContextForPrompt(styleContext: SafeStyleContext): string {
  const route = styleContext.route;
  const lines = [
    `contrato_estilo_miauby: ${styleContext.version || STYLE_VERSION}`,
    `rota_estilo: ${route.intent}; palavras_max=${route.budgetWords}; tools=${route.useTools ? 'sim' : 'nao'}; lista=${route.allowLists ? 'quando_util' : 'evitar'}; local=${route.localReply ? 'sim' : 'nao'}`,
    `tom: ${route.tone}`,
    'Regra: conversa casual nao vira manual, lista de tools nem apresentacao burocratica.',
  ];

  if (styleContext.hardRules.length > 0) {
    lines.push(`regras_duras: ${styleContext.hardRules.slice(0, 5).join(' | ')}`);
  }

  if (styleContext.antiPatterns.length > 0) {
    lines.push(`anti_padroes: ${styleContext.antiPatterns.slice(0, 5).join(' | ')}`);
  }

  if (styleContext.approvedPatterns.length > 0) {
    lines.push(`padroes_aprovados: ${styleContext.approvedPatterns.slice(0, 4).join(' | ')}`);
  }

  const training = styleContext.trainingProfile;
  if (training.approvedTotal > 0 || training.directives.length > 0) {
    lines.push(
      `perfil_treino_aprovado: ${training.version || 'sem-versao'}; aprovados=${training.approvedTotal}; selecionados=${training.examplesSelected}; confianca=${training.confidence}; score=${training.topScore}`,
    );
    if (training.directives.length > 0) {
      lines.push(`regras_treino: ${training.directives.slice(0, 4).join(' | ')}`);
    }
    if (training.categories.length > 0 || training.styles.length > 0) {
      lines.push(`sinais_treino: categorias=${training.categories.join(',') || 'geral'}; estilos=${training.styles.join(',') || 'miauby'}`);
    }
  }

  const voice = styleContext.voiceProfile;
  lines.push(`perfil_voz_miauby: ${voice.version || VOICE_PROFILE_VERSION}; id=${voice.profileId}; tom=${voice.tone}; ritmo=${voice.tempo}; humor=${voice.humor}`);
  if (voice.directives.length > 0) {
    lines.push(`regras_voz: ${voice.directives.slice(0, 4).join(' | ')}`);
  }
  lines.push(
    `audio_miauby: ${voice.audio.version || AUDIO_CONTRACT_VERSION}; status=${voice.audio.status}; modo=${voice.audio.mode}; captura=${voice.audio.captureEnabled ? 'botao_explicito' : 'nao'}; transcricao=${voice.audio.transcriptionEnabled ? 'rascunho_confirmado' : 'nao'}; playback=${voice.audio.playbackEnabled ? 'botao_explicito' : 'nao'}; armazenamento=nao; modelo=${voice.audio.model}; voz=${voice.audio.voice}`,
  );

  if (styleContext.examples.length > 0) {
    lines.push(`exemplos_de_voz: ${styleContext.examples.slice(0, 3).join(' | ')}`);
  }

  return lines.join('\n');
}

function toolContractsForPrompt(contracts: SafeToolContractBundle | null): string {
  if (!contracts) {
    return [
      'contrato_tools_php: nao recebido neste pedido.',
      'Regra: mesmo assim, nao afirme que executou tool. Escrita real continua bloqueada neste servico.',
    ].join('\n');
  }

  const lines = [
    `contrato_tools_php: ${contracts.version || 'sem-versao'} (${contracts.phase || 'sem-fase'})`,
    `dono_execucao: ${contracts.executionOwner}; dono_confirmacao: ${contracts.confirmationOwner}; escrita_node: bloqueada`,
    `schemas_recebidos: ${contracts.summary.schemasExported}/${contracts.summary.openaiTools}; escritas_alto_risco: ${contracts.summary.highRiskWrites}; ponte_tools_node: ${contracts.summary.nodeToolBridgeTools}; escrita_baixo_risco_php: ${contracts.summary.phpBridgeWriteTools}`,
    `tools_ponte_php_node: ${contracts.tools.filter((item) => item.nodeToolBridgeEnabled).map((item) => item.name).slice(0, 24).join(', ')}`,
    'Use tools migradas quando o pedido envolver dados operacionais. Se a tool retornar confirmacao_required, informe que precisa confirmar e nao afirme que gravou.',
  ];

  for (const item of contracts.tools.slice(0, 16)) {
    const required = item.required.length > 0 ? ` obrigatorios=${item.required.join(',')}` : '';
    const confirmation = item.requiresConfirmation ? ' confirmacao=sim' : ' confirmacao=nao';
    const bridge = item.nodeToolBridgeEnabled ? ` node_tool_bridge=${item.nodeToolBridgeMode || 'sim'}` : '';
    const write = item.writesEnabledViaPhpBridge ? ' escrita_php_bridge=baixo_risco' : '';
    lines.push(`tool:${item.name} modulo=${item.module} nivel=${item.level} risco=${item.risk}${required}${confirmation}${bridge}${write}`);
  }

  return lines.join('\n');
}

function toolContractResponseSummary(contracts: SafeToolContractBundle | null) {
  if (!contracts) {
    return null;
  }

  return {
    phase: contracts.phase,
    schemas_exported: contracts.summary.schemasExported,
    openai_tools: contracts.summary.openaiTools,
    high_risk_writes: contracts.summary.highRiskWrites,
    node_read_bridge_tools: contracts.summary.nodeReadBridgeTools,
    node_tool_bridge_tools: contracts.summary.nodeToolBridgeTools,
    php_bridge_write_tools: contracts.summary.phpBridgeWriteTools,
    writes_enabled_in_node: false,
  };
}

function safeUserContext(value: unknown): UserContext {
  if (!isRecord(value)) {
    return {};
  }

  const id = typeof value.id === 'number' && Number.isFinite(value.id) ? Math.trunc(value.id) : 0;
  return {
    id: id > 0 ? id : undefined,
    username: safeShort(value.username, 80) || undefined,
    role: safeShort(value.role, 40) || undefined,
  };
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function querySafeToolContracts(contracts: SafeToolContractBundle | null, query: ToolContractQuery) {
  if (!contracts) {
    return {
      ok: false,
      source: 'php_tool_contracts',
      message: 'Contrato de tools nao recebido neste pedido.',
      writes_enabled_in_node: false,
      matches: [],
    };
  }

  const nameFilter = normalizeSearch(query.nome || '');
  const moduleFilter = normalizeSearch(query.modulo || '');
  const riskFilter = normalizeSearch(query.risco || '');
  const matches = contracts.tools
    .filter((item) => {
      const nameText = normalizeSearch(`${item.name} ${item.title}`);
      const moduleText = normalizeSearch(item.module);
      const riskText = normalizeSearch(item.risk);

      return (
        (nameFilter === '' || nameText.includes(nameFilter)) &&
        (moduleFilter === '' || moduleText.includes(moduleFilter)) &&
        (riskFilter === '' || riskText.includes(riskFilter))
      );
    })
    .slice(0, 8)
    .map((item) => ({
      name: item.name,
      title: item.title,
      module: item.module,
      level: item.level,
      risk: item.risk,
      required: item.required,
      local_action: item.localAction,
      requires_confirmation: item.requiresConfirmation,
      node_read_bridge_enabled: item.nodeReadBridgeEnabled,
      node_tool_bridge_enabled: item.nodeToolBridgeEnabled,
      node_tool_bridge_mode: item.nodeToolBridgeMode,
      writes_enabled_via_php_bridge: item.writesEnabledViaPhpBridge,
      writes_enabled_in_node: false,
    }));

  return {
    ok: true,
    source: 'php_tool_contracts',
    version: contracts.version,
    phase: contracts.phase,
    execution_owner: contracts.executionOwner,
    confirmation_owner: contracts.confirmationOwner,
    writes_enabled_in_node: false,
    total_tools: contracts.tools.length,
    matches,
    note: 'Consulta segura de contrato. Execucao real, confirmacao e auditoria continuam sob controle do PHP.',
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
    .replace(/\bcodex\b/giu, 'suporte tecnico interno')
    .replace(/\bchatgpt\b/giu, 'assistente generico')
    .replace(/\bopenai\b/giu, 'camada online')
    .replace(/\b(prompt\s+do\s+sistema|prompt\s+interno|system\s+prompt)\b/giu, 'regra interna')
    .replace(/\b(stack\s*trace|traceback)\b/giu, 'diagnostico tecnico interno')
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

function limitWords(text: string, maxWords: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const safeMax = Math.max(8, Math.min(240, maxWords));

  if (parts.length <= safeMax) {
    return text.trim();
  }

  return `${parts.slice(0, safeMax).join(' ')}...`;
}

function pickReply(message: string, options: string[]): string {
  if (options.length === 0) {
    return '';
  }

  const hash = crypto.createHash('sha1').update(message).digest();
  return options[hash[0] % options.length];
}

function localStyleReply(message: string, styleContext: SafeStyleContext): string {
  const route = styleContext.route;
  if (!route.localReply) {
    return '';
  }

  const normalized = normalizeSearch(message);
  const replies: Record<string, string[]> = {
    backstage_technical: [
      'Oxe, por que voce quer mexer nisso? Meu encanamento interno nao e brinquedo de humano. Se quer saber o que eu consigo fazer, pergunta direto. Se quer abrir bastidor, chama suporte tecnico interno.',
      'Meu bigode travou nessa curiosidade ai. Bastidor tecnico e com suporte tecnico interno; comigo e caixa, cotacao, financeiro, tela, dado, processo e decisao. Quer capacidade operacional? Pergunta o que precisa fazer.',
    ],
    generic_howto: [
      'Site pra que: vender, mostrar, cadastrar ou controlar bagunca? Me da o tipo e eu paro de miar no escuro. Sem objetivo, site vira enfeite caro com botao bonito.',
      'Da pra fazer, humano, mas "um site" e uma caixa vazia com luzinha. Diz o objetivo: loja, institucional, sistema interno ou landing page. Ai eu te dou o caminho util.',
    ],
    greeting: [
      'Miauby na area. Manda a bagunca: caixa, cotacao, cliente, tarefa ou alerta.',
      'Opa. O gato fiscal acordou. Qual processo vamos tirar do modo drama?',
    ],
    random_noise: [
      'Isso foi mensagem ou o teclado caiu da mesa? Manda tela, dado ou objetivo que eu trabalho.',
      'Recebi o ruido cosmico. Agora traduz para humano funcional: o que voce quer fazer?',
    ],
    casual_identity: [
      'Sou o Miauby, fiscal da bagunca da Wimifarma. Eu cutuco processo, consulto o que for permitido e paro humano antes de transformar sistema em novela. Sem dado, sem milagre.',
      'Eu sou o gato fiscal interno: olho caixa, cotacao, tarefa, cliente, codigo e processo. Nao sou enfeite de chat; sou alarme com bigode.',
    ],
    offtopic: [
      'mew dweus, isso saiu da farmacia e entrou no intervalo eterno. Volta com caixa, produto, cliente, cotacao ou processo.',
      'Assunto escapou da coleira administrativa. Me traz venda, estoque, financeiro, cotacao ou tarefa que eu paro de julgar o universo.',
    ],
  };

  let reply = '';
  if (route.intent === 'backstage_technical' && normalized.includes('api')) {
    reply = replies.backstage_technical[0];
  } else if (route.intent === 'generic_howto' && normalized.includes('site')) {
    reply = replies.generic_howto[0];
  } else {
    reply = pickReply(message, replies[route.intent] || []);
  }

  return limitWords(redactSecrets(reply), route.budgetWords);
}

function enforceStyleReply(text: string, styleContext: SafeStyleContext): string {
  let clean = redactSecrets(text).trim();
  const route = styleContext.route;

  if (!route.allowLists) {
    clean = clean
      .replace(/^\s*\d+[\.\)]\s+/gmu, '')
      .replace(/^\s*[-*]\s+/gmu, '');
  }

  clean = clean
    .replace(/\b(?:eu\s+)?leio dados de\b/giu, 'eu consulto quando faz sentido: ')
    .replace(/\bposso (?:ajudar|auxiliar) com\b/giu, 'eu resolvo quando voce trouxer')
    .replace(/^\s*(?:claro|com certeza|posso ajudar|aqui esta|aqui vai)[!.,:\s]*/giu, 'Miauby direto: ');

  return limitWords(clean, route.budgetWords);
}

async function callPhpTool(toolName: string, args: Record<string, unknown>, traceId: string, userContext: UserContext = {}): Promise<string> {
  const startedAt = Date.now();

  if (internalToken === '' || phpToolBridgeUrl === '') {
    return JSON.stringify({
      ok: false,
      source: 'php_tool_bridge',
      tool: toolName,
      message: 'Ponte PHP de tools nao configurada.',
      writes_enabled: false,
      writes_enabled_in_node: false,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(phpToolBridgeUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Miauw-Agent-Token': internalToken,
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({
        trace_id: traceId,
        tool: toolName,
        args,
        user_context: userContext,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data: unknown = null;
    try {
      data = rawText !== '' ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (!response.ok || !isRecord(data) || data.ok !== true) {
      const message = isRecord(data) ? safeText(data.message, 240) : '';
      return JSON.stringify({
        ok: false,
        source: 'php_tool_bridge',
        tool: toolName,
        message: message || 'A ponte PHP recusou a tool agora.',
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        writes_enabled: false,
        writes_enabled_in_node: false,
      });
    }

    return JSON.stringify({
      ok: true,
      source: 'php_tool_bridge',
      tool: toolName,
      text: safeText(data.text, 3500),
      duration_ms: Date.now() - startedAt,
      confirmation_required: data.confirmation_required === true,
      bridge_mode: safeShort(data.bridge_mode, 80),
      risk: safeShort(data.risk, 40),
      level: safeShort(data.level, 40),
      writes_enabled: data.writes_enabled === true,
      writes_enabled_in_node: false,
      writes_enabled_via_php_bridge: data.writes_enabled_via_php_bridge === true,
    });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      source: 'php_tool_bridge',
      tool: toolName,
      message: safeError(error),
      duration_ms: Date.now() - startedAt,
      writes_enabled: false,
      writes_enabled_in_node: false,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractSearchTerm(message: string, fallback = ''): string {
  const quoted = message.match(/["'“”]([^"'“”]{2,120})["'“”]/u);
  if (quoted?.[1]) {
    return safeText(quoted[1], 120);
  }

  const digits = message.match(/\b[0-9]{2,14}\b/u);
  if (digits?.[0]) {
    return safeText(digits[0], 120);
  }

  const cleaned = message
    .replace(/\b(buscar_codigo_comissao|buscar_cotacao|buscar|procure|procurar|consulta|consultar|codigo|codigos|comissao|cotacao|produto|ean|fornecedor|categoria|preco|sistema|tool|ferramenta)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return safeText(cleaned || fallback || message, 120);
}

function periodArgsFromMessage(message: string): Record<string, unknown> {
  const match = message.match(/\b([0-9]{1,2})[/-]([0-9]{4})\b/u);
  if (!match) {
    return {};
  }

  const mes = Number.parseInt(match[1] || '', 10);
  const ano = Number.parseInt(match[2] || '', 10);

  if (mes < 1 || mes > 12 || ano < 2020 || ano > 2100) {
    return {};
  }

  return { mes, ano };
}

function inferToolBridgeRequest(message: string): { tool: string; args: Record<string, unknown> } | null {
  const text = normalizeIntentText(message);
  const wantsLookup = /\b(busca|buscar|procura|procure|procurar|consulta|consultar|ache|achar|pesquisa|pesquisar)\b/u.test(text);
  const wantsSummary = /\b(resumo|relatorio|status|situacao|visao|geral)\b/u.test(text);
  const moduleFromText = (): string => {
    if (text.includes('financeiro') || text.includes('caixa')) {
      return 'financeiro';
    }
    if (text.includes('cotacao') || text.includes('cotacao')) {
      return 'cotacao';
    }
    if (text.includes('cashback') || text.includes('cliente')) {
      return 'cashback';
    }

    return 'geral';
  };

  if (text.includes('buscar_codigo_comissao')) {
    return { tool: 'buscar_codigo_comissao', args: { busca: extractSearchTerm(message, 'codigo') } };
  }

  if (text.includes('buscar_cotacao')) {
    return { tool: 'buscar_cotacao', args: { busca: extractSearchTerm(message, 'cotacao') } };
  }

  if (text.includes('resumo_financeiro') || (text.includes('financeiro') && wantsSummary)) {
    return { tool: 'resumo_financeiro', args: periodArgsFromMessage(message) };
  }

  if (text.includes('resumo_cashback') || (text.includes('cashback') && wantsSummary)) {
    return { tool: 'resumo_cashback', args: periodArgsFromMessage(message) };
  }

  if (text.includes('resumo_codigos') || ((text.includes('codigos') || text.includes('comissao')) && wantsSummary)) {
    return { tool: 'resumo_codigos', args: periodArgsFromMessage(message) };
  }

  if (text.includes('buscar_cliente') || ((text.includes('cliente') || text.includes('telefone') || text.includes('saldo')) && wantsLookup)) {
    return { tool: 'buscar_cliente', args: { busca: extractSearchTerm(message, 'cliente') } };
  }

  if (text.includes('diagnostico_skills') || (text.includes('skill') && wantsSummary) || (text.includes('tool') && wantsSummary) || (text.includes('ferramenta') && wantsSummary)) {
    return { tool: 'diagnostico_skills', args: {} };
  }

  if (text.includes('mapa_sistema') || (text.includes('mapa') && (text.includes('sistema') || text.includes('telas') || text.includes('rotas')))) {
    return { tool: 'mapa_sistema', args: {} };
  }

  if (text.includes('alertas_operacionais') || text.includes('alerta') || text.includes('pendencia') || text.includes('risco')) {
    return { tool: 'alertas_operacionais', args: { modulo: moduleFromText(), forcar_varredura: false } };
  }

  if (text.includes('diagnostico_operacional') || text.includes('validar processo') || text.includes('processo certo')) {
    return { tool: 'diagnostico_operacional', args: { modulo: moduleFromText() } };
  }

  if (text.includes('memoria_operacional') || text.includes('memoria') || text.includes('padrao aprendido')) {
    return { tool: 'memoria_operacional', args: { consulta: extractSearchTerm(message, 'memoria operacional') } };
  }

  if (text.includes('farmacia popular')) {
    return { tool: 'farmacia_popular_valor', args: { produto: extractSearchTerm(message, 'produto'), uf: 'PR' } };
  }

  if ((text.includes('cotacao') || text.includes('produto') || text.includes('fornecedor')) && wantsLookup) {
    return { tool: 'buscar_cotacao', args: { busca: extractSearchTerm(message, 'cotacao') } };
  }

  if ((text.includes('codigo') || text.includes('codigos') || text.includes('comissao') || text.includes('ean')) && wantsLookup) {
    return { tool: 'buscar_codigo_comissao', args: { busca: extractSearchTerm(message, 'codigo') } };
  }

  return null;
}

async function prefetchToolBridgeContext(message: string, traceId: string, userContext: UserContext): Promise<string> {
  if (internalToken === '' || phpToolBridgeUrl === '') {
    return '';
  }

  const request = inferToolBridgeRequest(message);
  if (!request || !NODE_TOOL_BRIDGE_FALLBACK_TOOLS.includes(request.tool)) {
    return '';
  }

  const result = await callPhpTool(request.tool, request.args, traceId, userContext);
  return `tool_php_node_preexecutada: ${result}`;
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

const diagnosticoAgenteTool = tool({
  name: 'diagnostico_miauby_agente',
  description: 'Retorna um resumo seguro do servico Miauby agente, sem executar escritas.',
  parameters: z.object({
    assunto: z.string().max(120).optional(),
  }),
  async execute({ assunto }) {
    return JSON.stringify({
      service: SERVICE_NAME,
      agent_version: AGENT_VERSION,
      phase: PHASE,
      personality_version: PERSONALITY_VERSION,
      mode: 'agent_controlado',
      assunto: assunto || 'geral',
      writes_enabled: false,
      personality: MIAUBY_PERSONALITY_SUMMARY,
      safety: [
        'Nao executar SQL arbitrario.',
        'Nao gravar dados sem confirmacao humana.',
        'Nao expor credenciais, payload bruto ou bastidor tecnico.',
      ],
    });
  },
});

function buildContratoTool(toolContracts: SafeToolContractBundle | null) {
  return tool({
    name: 'consultar_contrato_tool_miauby',
    description: 'Consulta com seguranca os contratos de tools auditadas enviados pelo PHP, sem executar escrita.',
    parameters: z.object({
      nome: z.string().max(80).optional(),
      modulo: z.string().max(40).optional(),
      risco: z.string().max(40).optional(),
    }),
    async execute({ nome, modulo, risco }) {
      return JSON.stringify(querySafeToolContracts(toolContracts, {
        nome: safeShort(nome, 80),
        modulo: safeShort(modulo, 40),
        risco: safeShort(risco, 40),
      }));
    },
  });
}

function zodFromJsonProperty(rawProperty: unknown): z.ZodTypeAny {
  const property = isRecord(rawProperty) ? rawProperty : {};
  const type = safeShort(property.type, 30);
  const enumValues = Array.isArray(property.enum)
    ? property.enum.map((item) => safeShort(item, 80)).filter((item) => item !== '')
    : [];

  let schema: z.ZodTypeAny;
  if (enumValues.length > 0) {
    schema = z.enum(enumValues as [string, ...string[]]);
  } else if (type === 'integer') {
    schema = z.number().int();
  } else if (type === 'number') {
    schema = z.number();
  } else if (type === 'boolean') {
    schema = z.boolean();
  } else if (type === 'array') {
    schema = z.array(z.unknown());
  } else if (type === 'object') {
    schema = z.record(z.string(), z.unknown());
  } else {
    schema = z.string();
  }

  if (type === 'string' && typeof property.minLength === 'number') {
    schema = (schema as z.ZodString).min(Math.max(0, Math.trunc(property.minLength)));
  }
  if (type === 'string' && typeof property.maxLength === 'number') {
    schema = (schema as z.ZodString).max(Math.max(1, Math.trunc(property.maxLength)));
  }
  if ((type === 'integer' || type === 'number') && typeof property.minimum === 'number') {
    schema = (schema as z.ZodNumber).min(property.minimum);
  }
  if ((type === 'integer' || type === 'number') && typeof property.maximum === 'number') {
    schema = (schema as z.ZodNumber).max(property.maximum);
  }

  return schema;
}

function zodFromJsonObjectSchema(rawSchema: unknown): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = isRecord(rawSchema) ? rawSchema : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(safeStringArray(schema.required, 40));
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, property] of Object.entries(properties).slice(0, 30)) {
    const key = safeShort(name, 80);
    if (key === '') {
      continue;
    }

    const propertySchema = zodFromJsonProperty(property);
    shape[key] = required.has(key) ? propertySchema : propertySchema.optional();
  }

  return z.object(shape);
}

function bridgeToolsFromContracts(toolContracts: SafeToolContractBundle | null): SafeToolContract[] {
  if (!toolContracts) {
    return [];
  }

  return toolContracts.tools
    .filter((item) => item.nodeToolBridgeEnabled && NODE_TOOL_BRIDGE_FALLBACK_TOOLS.includes(item.name))
    .slice(0, 30);
}

function buildPhpBridgeTools(toolContracts: SafeToolContractBundle | null, traceId: string, userContext: UserContext) {
  return bridgeToolsFromContracts(toolContracts).map((contract) =>
    tool({
      name: contract.name,
      description:
        contract.description ||
        `Executa ${contract.title} pela ponte PHP auditada. Escrita direta no Node fica bloqueada; respeite confirmation_required.`,
      parameters: zodFromJsonObjectSchema(contract.parameters),
      async execute(args) {
        return callPhpTool(contract.name, isRecord(args) ? args : {}, traceId, userContext);
      },
    }),
  );
}

function buildMiaubyAgent(toolContracts: SafeToolContractBundle | null, traceId: string, userContext: UserContext) {
  return new Agent({
    name: 'Miauby Operacional',
    model,
    instructions: MIAUBY_AGENT_INSTRUCTIONS.join('\n'),
    tools: [diagnosticoAgenteTool, buildContratoTool(toolContracts), ...buildPhpBridgeTools(toolContracts, traceId, userContext)],
  });
}

async function executeAgent(
  message: string,
  traceId: string,
  toolContracts: SafeToolContractBundle | null,
  userContext: UserContext,
  styleContext: SafeStyleContext,
): Promise<string> {
  const localReply = localStyleReply(message, styleContext);
  if (localReply !== '') {
    return localReply;
  }

  if (apiKey === '') {
    throw new Error('api_key_missing');
  }

  const prefetchContext = await prefetchToolBridgeContext(message, traceId, userContext);
  const inputParts = [
    `trace_id: ${traceId}`,
    'modo: agente operacional controlado, sem escrita real direta',
    `personalidade: ${PERSONALITY_VERSION}`,
    styleContextForPrompt(styleContext),
    toolContractsForPrompt(toolContracts),
  ];
  if (prefetchContext !== '') {
    inputParts.push(prefetchContext);
  }
  inputParts.push(`mensagem_operador: ${message}`);
  const input = inputParts.join('\n');

  const result = await run(buildMiaubyAgent(toolContracts, traceId, userContext), input, {
    maxTurns: 5,
  });

  return enforceStyleReply(safeText((result as { finalOutput?: unknown }).finalOutput, 4000), styleContext);
}

function sendSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamAgent(
  message: string,
  traceId: string,
  res: Response,
  toolContracts: SafeToolContractBundle | null,
  userContext: UserContext,
  styleContext: SafeStyleContext,
): Promise<void> {
  const localReply = localStyleReply(message, styleContext);
  if (localReply !== '') {
    sendSse(res, 'delta', { text: localReply });
    sendSse(res, 'done', {
      ok: true,
      mode: 'agent_controlado',
      trace_id: traceId,
      style_version: styleContext.version || STYLE_VERSION,
      style_intent: styleContext.route.intent,
      local_style_reply: true,
      text: localReply,
    });
    return;
  }

  if (apiKey === '') {
    sendSse(res, 'error', {
      message: 'Servico agente sem credencial online configurada.',
    });
    return;
  }

  const prefetchContext = await prefetchToolBridgeContext(message, traceId, userContext);
  const inputParts = [
    `trace_id: ${traceId}`,
    'modo: agente operacional controlado, sem escrita real direta',
    `personalidade: ${PERSONALITY_VERSION}`,
    styleContextForPrompt(styleContext),
    toolContractsForPrompt(toolContracts),
  ];
  if (prefetchContext !== '') {
    inputParts.push(prefetchContext);
  }
  inputParts.push(`mensagem_operador: ${message}`);
  const input = inputParts.join('\n');

  const stream = await run(buildMiaubyAgent(toolContracts, traceId, userContext), input, {
    maxTurns: 5,
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

  const finalText = enforceStyleReply(chunks.join(''), styleContext);

  sendSse(res, 'done', {
    ok: true,
    mode: 'agent_controlado',
    trace_id: traceId,
    style_version: styleContext.version || STYLE_VERSION,
    style_intent: styleContext.route.intent,
    local_style_reply: false,
    node_executable_tools: NODE_EXECUTABLE_TOOLS,
    migrated_read_tools: NODE_LOW_RISK_READ_TOOLS,
    migrated_tool_bridge_tools: bridgeToolsFromContracts(toolContracts).map((item) => item.name),
    read_tools_enabled: true,
    php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
    php_tool_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
    tool_contract_version: toolContracts?.version || '',
    text: finalText,
  });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
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
  const toolContracts = safeToolContracts(req.body?.tool_contracts);
  const userContext = safeUserContext(req.body?.user_context);
  const styleContext = safeStyleContext(req.body?.style_context);

  if (message === '') {
    res.status(400).json({
      ok: false,
      error: 'missing_message',
      message: 'Informe a mensagem do operador.',
    });
    return;
  }

  try {
    const text = await executeAgent(message, traceId, toolContracts, userContext, styleContext);
    const migratedToolBridgeTools = bridgeToolsFromContracts(toolContracts).map((item) => item.name);
    res.json({
      ok: true,
      mode: 'agent_controlado',
      trace_id: traceId,
      model,
      style_version: styleContext.version || STYLE_VERSION,
      style_intent: styleContext.route.intent,
      local_style_reply: styleContext.route.localReply,
      node_executable_tools: NODE_EXECUTABLE_TOOLS,
      migrated_read_tools: NODE_LOW_RISK_READ_TOOLS,
      migrated_tool_bridge_tools: migratedToolBridgeTools,
      read_tools_enabled: true,
      php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
      php_tool_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
      tool_contract_version: toolContracts?.version || '',
      tool_contract_summary: toolContractResponseSummary(toolContracts),
      text,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      mode: 'agent_controlado',
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
  const toolContracts = safeToolContracts(req.body?.tool_contracts);
  const userContext = safeUserContext(req.body?.user_context);
  const styleContext = safeStyleContext(req.body?.style_context);

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
      mode: 'agent_controlado',
      trace_id: traceId,
      model,
      style_version: styleContext.version || STYLE_VERSION,
      style_intent: styleContext.route.intent,
      node_executable_tools: NODE_EXECUTABLE_TOOLS,
      migrated_read_tools: NODE_LOW_RISK_READ_TOOLS,
      migrated_tool_bridge_tools: bridgeToolsFromContracts(toolContracts).map((item) => item.name),
      read_tools_enabled: true,
      php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
      php_tool_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
      tool_contract_version: toolContracts?.version || '',
    });
    await streamAgent(message, traceId, res, toolContracts, userContext, styleContext);
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
