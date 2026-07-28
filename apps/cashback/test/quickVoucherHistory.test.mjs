import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverUrl = new URL('../src/server.ts', import.meta.url);
const stylesUrl = new URL('../../../site/cashback/styles.css', import.meta.url);

test('quick voucher history summarizes direct registrations by responsible user', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const summaryStart = serverSource.indexOf('async function loadQuickVoucherUserSummary');
  const summaryEnd = serverSource.indexOf('async function loadQuickVoucherHistory', summaryStart);
  const summaryQuery = serverSource.slice(summaryStart, summaryEnd);

  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart, 'user summary loader should exist');
  assert.match(summaryQuery, /COALESCE\(q\.parent_voucher_id, 0\) = 0/);
  assert.match(summaryQuery, /COALESCE\(q\.source_purchase_id, 0\) = 0/);
  assert.match(summaryQuery, /COUNT\(\*\)::integer AS issued_count/);
  assert.match(summaryQuery, /FILTER\s*\(\s*WHERE q\.status = 'ativo'/);
  assert.match(summaryQuery, /GROUP BY q\.issued_attendant_id, issued_attendant\.name/);
  assert.match(summaryQuery, /ORDER BY issued_count DESC/);
});

test('quick voucher history renders user totals and preserves operational actions', async () => {
  const [serverSource, stylesSource] = await Promise.all([
    readFile(serverUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);
  const renderStart = serverSource.indexOf('function renderQuickVoucherHistory');
  const renderEnd = serverSource.indexOf('function renderQuickVoucherReceipt', renderStart);
  const historyRender = serverSource.slice(renderStart, renderEnd);

  assert.match(historyRender, /userSummaries: DbRow\[\]/);
  assert.match(historyRender, /quick-voucher-user-summary/);
  assert.match(historyRender, /Cadastros por usuario/);
  assert.match(historyRender, /quick-voucher-user-card/);
  assert.match(historyRender, /name="action" value="cancel_quick_voucher"/);
  assert.match(historyRender, /name="action" value="revoke_quick_voucher_xp"/);
  assert.match(stylesSource, /\.quick-voucher-user-grid/);
  assert.match(stylesSource, /\.quick-voucher-history-list\s*\{[^}]*grid-template-columns/s);
});
