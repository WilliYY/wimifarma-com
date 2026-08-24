import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { safeInboundText } from './message-text.js';

test('preserva cada produto em sua linha na mensagem recebida', () => {
  const message = [
    'miauby falta losartana 50',
    'pregabalina 150',
    'pano de chao branco',
    'suco tang',
  ].join('\n');

  assert.equal(safeInboundText(message, 4000), message);
});

test('normaliza CRLF e espacos sem apagar quebras de linha', () => {
  assert.equal(
    safeInboundText('  miauby falta losartana 50  \r\n  pregabalina\t150  ', 4000),
    'miauby falta losartana 50\npregabalina 150',
  );
});

test('Meta e Evolution usam o normalizador que preserva varias linhas', () => {
  const serverSource = fs.readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  const uses = serverSource.match(/bodyText:\s*safeInboundText\(messageInfo\.text,\s*4000\)/gu) || [];

  assert.equal(uses.length, 2);
});
