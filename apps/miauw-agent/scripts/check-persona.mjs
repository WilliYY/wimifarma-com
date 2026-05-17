import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'src', 'server.ts');
const source = fs.readFileSync(serverPath, 'utf8');

const required = [
  '2.0-fase20',
  'fase20-voice-reply-audio-bubbles',
  'PERSONALITY_VERSION',
  'STYLE_VERSION',
  'VOICE_PROFILE_VERSION',
  'AUDIO_CONTRACT_VERSION',
  'miauby-persona-2026-05-16',
  'miauby-style-router-2026-05-16',
  'miauby-voice-profile-2026-05-17',
  'miauby-voice-reply-2026-05-17',
  'personalidade forte + solucao pratica',
  'Sem dado, sem milagre',
  'fiscal interno',
  'Pergunta casual nao vira lista de ferramentas',
  'suporte tecnico interno',
  'Nao invente dado real',
  'styleContextForPrompt',
  'training_context_supported',
  'training_profile_supported',
  'voice_profile_supported',
  'audio_readiness_supported',
  'record_transcribe_audio_supported',
  'voice_reply_supported',
  'audio_bubble_player_supported',
  'short_audio_guard_supported',
  'audio_confirmation_required',
  'browser_audio_capture_supported',
  'browser_audio_requires_user_action',
  'audio_capture_enabled',
  'audio_tts_enabled',
  'perfil_treino_aprovado',
  'perfil_voz_miauby',
  'audio_miauby',
  'rascunho transcrito',
  'resposta pode voltar falada',
  'botao explicito',
  'O perfil compilado de treino aprovado',
  'localStyleReply',
  'toolContractsForPrompt',
  'consultar_contrato_tool_miauby',
  'php_tool_bridge',
  'buscar_codigo_comissao',
  'escrita_node: bloqueada',
];

const forbiddenInInstructions = [
  'Voce e o Miauby operacional da Wimifarma.',
  'cutover-ready\',',
  'diagnostico_miauby_sombra',
];

const missing = required.filter((needle) => !source.includes(needle));
if (missing.length > 0) {
  console.error(`Contrato de persona incompleto: ${missing.join(', ')}`);
  process.exit(1);
}

const foundForbidden = forbiddenInInstructions.filter((needle) => source.includes(needle));
if (foundForbidden.length > 0) {
  console.error(`Contrato antigo de persona ainda presente: ${foundForbidden.join(', ')}`);
  process.exit(1);
}

console.log('Miauby persona contract ok.');
