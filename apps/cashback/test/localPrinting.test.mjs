import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const browserScriptUrl = new URL('../../../site/cashback/app.js', import.meta.url);
const homeUrl = new URL('../../../site/home.php', import.meta.url);
const serverUrl = new URL('../src/server.ts', import.meta.url);

test('comprovantes usam somente a impressao local do navegador', async () => {
  const [browserScript, home, server] = await Promise.all([
    readFile(browserScriptUrl, 'utf8'),
    readFile(homeUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
  ]);

  assert.match(browserScript, /printOnThisComputer\(button\)/);
  assert.doesNotMatch(browserScript, /api-wimi-impressora\.php|wimi_offline|data-print-route/);
  assert.doesNotMatch(home, /Wimi Impressora|\/cashback\/impressora\.php/);
  assert.doesNotMatch(server, /from '\.\/printStation\.js'|nav\.push\(\['impressora\.php'/);
  assert.match(server, /A Wimi Impressora foi retirada/);
});
