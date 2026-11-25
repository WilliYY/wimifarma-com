type JsonRecord = Record<string, unknown>;
type OpenAiConfig = { apiKey: string; baseUrl: string; model: string; timeoutMs: number };

const nullableString = { type: ['string', 'null'] };
const confidence = { type: ['number', 'null'], minimum: 0, maximum: 1 };
const fieldProperties = {
  amount: confidence, payer_name: confidence, destination: confidence,
  paid_at: confidence, end_to_end_id: confidence,
};
const receiptProperties = {
  is_pix_receipt: { type: 'boolean' },
  payment_status: { type: 'string', enum: ['completed', 'scheduled', 'pending', 'failed', 'unknown'] },
  destination_cnpj_digits: nullableString, destination_key_digits: nullableString,
  destination_name: nullableString, payer_name: nullableString,
  amount_brl: { type: ['number', 'null'] },
  paid_at_date: nullableString, paid_at_time: nullableString,
  institution: nullableString, end_to_end_id: nullableString, transaction_id: nullableString,
  confidence, amount_confidence: confidence, payer_confidence: confidence,
  target_confidence: confidence, date_confidence: confidence, id_confidence: confidence,
  field_confidences: {
    type: 'object', properties: fieldProperties,
    required: Object.keys(fieldProperties), additionalProperties: false,
  },
  missing: { type: 'array', items: { type: 'string' } },
  diagnostics: { type: 'array', items: { type: 'string' } },
  raw_text: nullableString,
};

export const PIX_RECEIPT_RESPONSE_FORMAT = {
  type: 'json_schema', name: 'pix_receipt', strict: true,
  schema: {
    type: 'object', properties: receiptProperties,
    required: Object.keys(receiptProperties), additionalProperties: false,
  },
};

function record(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function openAiResponseText(data: JsonRecord): string {
  if (data.status === 'incomplete') throw new Error('openai_response_incomplete');
  if (data.status === 'failed' || data.error) throw new Error('openai_response_failed');
  const chunks: string[] = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (!record(item)) continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (!record(part)) continue;
      if (part.type === 'refusal') throw new Error('openai_response_refused');
      if (part.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  const text = chunks.join('').trim();
  if (!text) throw new Error('openai_empty_reply');
  return text;
}

export async function requestOpenAiResponse(
  config: OpenAiConfig,
  options: { instructions: string; input: unknown; maxOutputTokens: number; effort: 'none' | 'low'; format?: unknown },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, store: false, instructions: options.instructions, input: options.input,
        reasoning: { effort: options.effort }, max_output_tokens: options.maxOutputTokens,
        ...(options.format ? { text: { format: options.format } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const data: unknown = await response.json().catch(() => null);
    if (!record(data)) throw new Error('openai_response_invalid');
    return openAiResponseText(data);
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestOpenAiTranscription(
  config: OpenAiConfig,
  audio: { base64: string; mimeType: string },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const mime = audio.mimeType.split(';')[0].trim().toLowerCase();
  const extension: Record<string, string> = {
    'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/webm': 'webm', 'video/webm': 'webm', 'video/mp4': 'mp4', 'audio/flac': 'flac',
  };
  if (!extension[mime]) throw new Error('openai_audio_mime_unsupported');
  const form = new FormData();
  form.set('model', config.model);
  form.append('languages[]', 'pt');
  form.set('file', new Blob([Buffer.from(audio.base64, 'base64')], { type: mime }), `audio.${extension[mime]}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: controller.signal,
    });
    if (!response.ok) throw new Error(`openai_audio_http_${response.status}`);
    const data: unknown = await response.json().catch(() => null);
    if (!record(data) || typeof data.text !== 'string' || !data.text.trim()) throw new Error('openai_audio_empty_transcript');
    return data.text.trim();
  } finally {
    clearTimeout(timeout);
  }
}
