import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRINT_STATION_COOKIE,
  clearPrintStationCookie,
  cookieValue,
  createPrintStationToken,
  isPrintStationToken,
  printStationCsrfMatches,
  printStationCsrfToken,
  printStationShortcut,
  renderPrintStationPage,
  serializePrintStationCookie,
} from '../dist/printStation.js';

test('print station token and CSRF stay bound to the same browser credential', () => {
  const token = createPrintStationToken();
  const csrf = printStationCsrfToken('test-secret', token);

  assert.equal(token.length, 43);
  assert.equal(isPrintStationToken(token), true);
  assert.equal(printStationCsrfMatches('test-secret', token, csrf), true);
  assert.equal(printStationCsrfMatches('test-secret', token, `${csrf}x`), false);
  assert.equal(printStationCsrfMatches('other-secret', token, csrf), false);
});

test('station cookie is HttpOnly, strict, scoped and removable', () => {
  const token = createPrintStationToken();
  const serialized = serializePrintStationCookie(token, '/cashback', true);
  const cleared = clearPrintStationCookie('/cashback', true);

  assert.match(serialized, new RegExp(`^${PRINT_STATION_COOKIE}=`));
  assert.match(serialized, /Path=\/cashback/);
  assert.match(serialized, /HttpOnly/);
  assert.match(serialized, /SameSite=Strict/);
  assert.match(serialized, /Secure/);
  assert.equal(cookieValue(`a=1; ${PRINT_STATION_COOKIE}=${token}; b=2`, PRINT_STATION_COOKIE), token);
  assert.match(cleared, /Max-Age=0/);
});

test('web shortcut contains only transparent Chrome startup commands', () => {
  const shortcut = printStationShortcut('https://wimifarma.com/cashback/internal/print-station');

  assert.match(shortcut, /--kiosk-printing/);
  assert.match(shortcut, /--user-data-dir="%WIMI_PROFILE%"/);
  assert.match(shortcut, /WimiFarma\\ImpressoraWeb\\ChromeProfile/);
  assert.match(shortcut, /Google\\Chrome\\Application\\chrome\.exe/);
  assert.doesNotMatch(shortcut, /\.exe\s+https?:/i);
  assert.doesNotMatch(shortcut, /powershell|schtasks|reg\.exe|base64|hidden/i);
  assert.doesNotMatch(shortcut, /WFWIMIPRINT|token|secret/i);
});

test('station page contains single-tab locking, no installer and escaped station data', () => {
  const page = renderPrintStationPage({
    basePath: '/cashback',
    csrfToken: 'csrf-test',
    device: {
      id: 7,
      computerName: 'Caixa <script>',
      printerName: 'Bematech "Padrao"',
    },
    nonce: 'nonce-test',
    serviceVersion: '1.6.0',
  });

  assert.match(page, /navigator\.locks\.request/);
  assert.match(page, /afterprint/);
  assert.match(page, /status: 'uncertain'/);
  assert.match(page, /Caixa &lt;script&gt;/);
  assert.doesNotMatch(page, /WimiImpressoraSetup|Baixar instalador|\.exe/i);
  assert.doesNotMatch(page, /Caixa <script>/);
});
