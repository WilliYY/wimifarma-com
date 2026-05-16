import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'src', 'server.ts');
const source = fs.readFileSync(serverPath, 'utf8');

const required = [
  '2.0-fase11',
  'fase11-tool-contracts',
  'PERSONALITY_VERSION',
  'miauby-persona-2026-05-16',
  'personalidade forte + solucao pratica',
  'Sem dado, sem milagre',
  'fiscal interno',
  'suporte tecnico interno',
  'Nao invente dado real',
  'toolContractsForPrompt',
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
