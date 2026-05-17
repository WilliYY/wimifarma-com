import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'src', 'server.ts');
const source = fs.readFileSync(serverPath, 'utf8');

const required = [
  '2.0-fase17',
  'fase17-training-compiler',
  'PERSONALITY_VERSION',
  'STYLE_VERSION',
  'miauby-persona-2026-05-16',
  'miauby-style-router-2026-05-16',
  'personalidade forte + solucao pratica',
  'Sem dado, sem milagre',
  'fiscal interno',
  'Pergunta casual nao vira lista de ferramentas',
  'suporte tecnico interno',
  'Nao invente dado real',
  'styleContextForPrompt',
  'training_context_supported',
  'training_profile_supported',
  'perfil_treino_aprovado',
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
