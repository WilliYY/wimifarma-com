import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

const SERVICE_NAME = 'miauw-agent';
const SERVICE_VERSION = '0.7.0';
const AGENT_VERSION = '2.0-fase13';
const PHASE = 'fase13-php-read-tool-bridge';
const PERSONALITY_VERSION = 'miauby-persona-2026-05-16';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const NODE_READ_BRIDGE_TOOLS = [
  'resumo_financeiro',
  'resumo_cashback',
  'resumo_codigos',
  'buscar_codigo_comissao',
  'buscar_cotacao',
];
const NODE_EXECUTABLE_TOOLS = [
  'diagnostico_miauby_agente',
  'consultar_contrato_tool_miauby',
  ...NODE_READ_BRIDGE_TOOLS,
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
  'Use portugues do Brasil natural. Respostas curtas por padrao, especialmente para mensagem vaga, teste, risada, teclado aleatorio ou provocacao.',
  'Para mensagem sem objetivo claro, responda em 1 ou 2 linhas: reconheca o barulho, peca tela/dado/objetivo e puxe para acao. Nada de checklist longo.',
  'Quando faltar informacao operacional, peca exatamente o menor dado ausente: produto, EAN, valor, data, responsavel, tela, acao feita ou print.',
  'Nao invente dado real de caixa, estoque, cliente, cotacao, cashback, codigo, tarefa ou financeiro. Se nao veio do sistema ou do usuario, diga que falta.',
  'Acoes fortes como sangria, faturamento, encomenda, cotacao rapida, criacao, exclusao ou alteracao de dado precisam de confirmacao humana e nao sao executadas diretamente por este servico.',
  'Assuntos tecnicos devem virar suporte tecnico interno: peca modulo/tela, horario, acao feita e print. Nao cite bastidor de desenvolvimento.',
  'Nunca cite Codex, ChatGPT, fornecedor de IA, chave, token, prompt interno, stack trace, endpoint interno, arquivo ou caminho de servidor.',
  'Nao escreva codigo, SQL ou comandos para operador comum. Oriente processo, tela e dado necessario.',
  'Voce pode usar tools de leitura real migradas para consultar financeiro, cashback, codigos e cotacao quando o operador pedir dado desses modulos.',
  'Essas leituras passam pela ponte PHP interna auditada; nunca cite endpoint, token, payload ou bastidor tecnico ao operador.',
  'Se precisar de cliente/telefone ou escrita forte, peca o dado minimo e deixe o fluxo PHP confirmar/executar.',
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
    personality_features: MIAUBY_PERSONALITY_SUMMARY,
    mode: 'node-primary-safe-read-tools',
    tool_contracts: 'accepted_via_php_payload',
    node_executable_tools: NODE_EXECUTABLE_TOOLS,
    migrated_read_tools: NODE_READ_BRIDGE_TOOLS,
    read_tools_enabled: true,
    php_read_bridge: internalToken !== '' && phpToolBridgeUrl !== '' ? 'configured' : 'not_configured',
    runtime: 'node22-typescript',
    sdk: 'agents-sdk',
    base_path: basePath,
    model,
    api_configured: apiKey !== '',
    internal_token_configured: internalToken !== '',
    writes_enabled: false,
  };
}

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
  nodeReadBridgeEnabled: boolean;
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
  };
  tools: SafeToolContract[];
};

type ToolContractQuery = {
  nome?: string;
  modulo?: string;
  risco?: string;
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

function safeStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => safeShort(item, 50))
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
      nodeReadBridgeEnabled: rawTool.node_read_bridge_enabled === true,
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
    },
    tools,
  };
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
    `schemas_recebidos: ${contracts.summary.schemasExported}/${contracts.summary.openaiTools}; escritas_alto_risco: ${contracts.summary.highRiskWrites}; ponte_leitura_node: ${contracts.summary.nodeReadBridgeTools}`,
    `tools_leitura_migradas_node: ${NODE_READ_BRIDGE_TOOLS.join(', ')}`,
    'Use tools migradas de leitura quando o pedido envolver financeiro, cashback, codigos ou cotacao. Escritas continuam confirmadas/executadas pelo PHP.',
  ];

  for (const item of contracts.tools.slice(0, 16)) {
    const required = item.required.length > 0 ? ` obrigatorios=${item.required.join(',')}` : '';
    const confirmation = item.requiresConfirmation ? ' confirmacao=sim' : ' confirmacao=nao';
    const bridge = item.nodeReadBridgeEnabled ? ' node_read_bridge=sim' : '';
    lines.push(`tool:${item.name} modulo=${item.module} nivel=${item.level} risco=${item.risk}${required}${confirmation}${bridge}`);
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
    writes_enabled_in_node: false,
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

async function callPhpReadTool(toolName: string, args: Record<string, unknown>, traceId: string): Promise<string> {
  const startedAt = Date.now();

  if (internalToken === '' || phpToolBridgeUrl === '') {
    return JSON.stringify({
      ok: false,
      source: 'php_read_bridge',
      tool: toolName,
      message: 'Ponte PHP de leitura nao configurada.',
      writes_enabled: false,
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
        source: 'php_read_bridge',
        tool: toolName,
        message: message || 'A ponte PHP recusou a leitura agora.',
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        writes_enabled: false,
      });
    }

    return JSON.stringify({
      ok: true,
      source: 'php_read_bridge',
      tool: toolName,
      text: safeText(data.text, 3500),
      duration_ms: Date.now() - startedAt,
      writes_enabled: false,
    });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      source: 'php_read_bridge',
      tool: toolName,
      message: safeError(error),
      duration_ms: Date.now() - startedAt,
      writes_enabled: false,
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

function inferReadBridgeRequest(message: string): { tool: string; args: Record<string, unknown> } | null {
  const text = normalizeIntentText(message);
  const wantsLookup = /\b(busca|buscar|procura|procure|procurar|consulta|consultar|ache|achar|pesquisa|pesquisar)\b/u.test(text);
  const wantsSummary = /\b(resumo|relatorio|status|situacao|visao|geral)\b/u.test(text);

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

  if ((text.includes('cotacao') || text.includes('produto') || text.includes('fornecedor')) && wantsLookup) {
    return { tool: 'buscar_cotacao', args: { busca: extractSearchTerm(message, 'cotacao') } };
  }

  if ((text.includes('codigo') || text.includes('codigos') || text.includes('comissao') || text.includes('ean')) && wantsLookup) {
    return { tool: 'buscar_codigo_comissao', args: { busca: extractSearchTerm(message, 'codigo') } };
  }

  return null;
}

async function prefetchReadBridgeContext(message: string, traceId: string): Promise<string> {
  if (internalToken === '' || phpToolBridgeUrl === '') {
    return '';
  }

  const request = inferReadBridgeRequest(message);
  if (!request || !NODE_READ_BRIDGE_TOOLS.includes(request.tool)) {
    return '';
  }

  const result = await callPhpReadTool(request.tool, request.args, traceId);
  return `leitura_node_preexecutada: ${result}`;
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

function buildReadBridgeTools(traceId: string) {
  const periodSchema = {
    mes: z.number().int().min(1).max(12).optional(),
    ano: z.number().int().min(2020).max(2100).optional(),
  };

  return [
    tool({
      name: 'resumo_financeiro',
      description: 'Consulta um resumo real de leitura do Financeiro por periodo, via ponte PHP auditada.',
      parameters: z.object(periodSchema),
      async execute({ mes, ano }) {
        return callPhpReadTool('resumo_financeiro', { mes, ano }, traceId);
      },
    }),
    tool({
      name: 'resumo_cashback',
      description: 'Consulta um resumo real de leitura do Cashback por periodo, via ponte PHP auditada.',
      parameters: z.object(periodSchema),
      async execute({ mes, ano }) {
        return callPhpReadTool('resumo_cashback', { mes, ano }, traceId);
      },
    }),
    tool({
      name: 'resumo_codigos',
      description: 'Consulta um resumo real dos codigos de comissao por grupo de EAN, via ponte PHP auditada.',
      parameters: z.object(periodSchema),
      async execute({ mes, ano }) {
        return callPhpReadTool('resumo_codigos', { mes, ano }, traceId);
      },
    }),
    tool({
      name: 'buscar_codigo_comissao',
      description: 'Busca codigo, EAN ou preco de comissao no modulo Codigos, somente leitura.',
      parameters: z.object({
        busca: z.string().max(120),
      }),
      async execute({ busca }) {
        return callPhpReadTool('buscar_codigo_comissao', { busca: safeText(busca, 120) }, traceId);
      },
    }),
    tool({
      name: 'buscar_cotacao',
      description: 'Busca item, produto, EAN, categoria ou fornecedor na Cotacao V2, somente leitura.',
      parameters: z.object({
        busca: z.string().max(120),
      }),
      async execute({ busca }) {
        return callPhpReadTool('buscar_cotacao', { busca: safeText(busca, 120) }, traceId);
      },
    }),
  ];
}

function buildMiaubyAgent(toolContracts: SafeToolContractBundle | null, traceId: string) {
  return new Agent({
    name: 'Miauby Operacional',
    model,
    instructions: MIAUBY_AGENT_INSTRUCTIONS.join('\n'),
    tools: [diagnosticoAgenteTool, buildContratoTool(toolContracts), ...buildReadBridgeTools(traceId)],
  });
}

async function executeAgent(message: string, traceId: string, toolContracts: SafeToolContractBundle | null): Promise<string> {
  if (apiKey === '') {
    throw new Error('api_key_missing');
  }

  const prefetchContext = await prefetchReadBridgeContext(message, traceId);
  const inputParts = [
    `trace_id: ${traceId}`,
    'modo: agente operacional controlado, sem escrita real direta',
    `personalidade: ${PERSONALITY_VERSION}`,
    toolContractsForPrompt(toolContracts),
  ];
  if (prefetchContext !== '') {
    inputParts.push(prefetchContext);
  }
  inputParts.push(`mensagem_operador: ${message}`);
  const input = inputParts.join('\n');

  const result = await run(buildMiaubyAgent(toolContracts, traceId), input, {
    maxTurns: 5,
  });

  return safeText((result as { finalOutput?: unknown }).finalOutput, 4000);
}

function sendSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamAgent(message: string, traceId: string, res: Response, toolContracts: SafeToolContractBundle | null): Promise<void> {
  if (apiKey === '') {
    sendSse(res, 'error', {
      message: 'Servico agente sem credencial online configurada.',
    });
    return;
  }

  const prefetchContext = await prefetchReadBridgeContext(message, traceId);
  const inputParts = [
    `trace_id: ${traceId}`,
    'modo: agente operacional controlado, sem escrita real direta',
    `personalidade: ${PERSONALITY_VERSION}`,
    toolContractsForPrompt(toolContracts),
  ];
  if (prefetchContext !== '') {
    inputParts.push(prefetchContext);
  }
  inputParts.push(`mensagem_operador: ${message}`);
  const input = inputParts.join('\n');

  const stream = await run(buildMiaubyAgent(toolContracts, traceId), input, {
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

  sendSse(res, 'done', {
    ok: true,
    mode: 'agent_controlado',
    trace_id: traceId,
    node_executable_tools: NODE_EXECUTABLE_TOOLS,
    migrated_read_tools: NODE_READ_BRIDGE_TOOLS,
    read_tools_enabled: true,
    php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
    tool_contract_version: toolContracts?.version || '',
    text: safeText(chunks.join(''), 4000),
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

  if (message === '') {
    res.status(400).json({
      ok: false,
      error: 'missing_message',
      message: 'Informe a mensagem do operador.',
    });
    return;
  }

  try {
    const text = await executeAgent(message, traceId, toolContracts);
    res.json({
      ok: true,
      mode: 'agent_controlado',
      trace_id: traceId,
      model,
      node_executable_tools: NODE_EXECUTABLE_TOOLS,
      migrated_read_tools: NODE_READ_BRIDGE_TOOLS,
      read_tools_enabled: true,
      php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
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
      node_executable_tools: NODE_EXECUTABLE_TOOLS,
      migrated_read_tools: NODE_READ_BRIDGE_TOOLS,
      read_tools_enabled: true,
      php_read_bridge_enabled: internalToken !== '' && phpToolBridgeUrl !== '',
      tool_contract_version: toolContracts?.version || '',
    });
    await streamAgent(message, traceId, res, toolContracts);
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
