import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverUrl = new URL('../src/server.ts', import.meta.url);

test('cashback use selects an eligible user and exposes one print action', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const sectionStart = serverSource.indexOf('<section id="resgate"');
  const sectionEnd = serverSource.indexOf('<section id="cadastro"', sectionStart);
  const redemptionSection = serverSource.slice(sectionStart, sectionEnd);

  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'cashback use section should exist');
  assert.match(
    redemptionSection,
    /attendantSelect\(attendants, 'Usuario responsavel \*', loggedAttendantId, false, true, 'redeem-attendant'\)/,
    'responsible user must be selectable and required',
  );
  assert.match(redemptionSection, /name="print_after_save" value="1"/);
  assert.match(redemptionSection, /<span>Usar CashBack e imprimir<\/span>/);
  assert.match(redemptionSection, /XP_CASHBACK_REDEMPTION_POINTS\} XP ao concluir/);
  assert.equal((redemptionSection.match(/<button type="submit"/g) || []).length, 1);
});

test('automatic redemption validates the selected user and awards XP after commit', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const workflowStart = serverSource.indexOf('async function createAutomaticRedemption');
  const workflowEnd = serverSource.indexOf('async function createPurchaseAndCredit', workflowStart);
  const workflow = serverSource.slice(workflowStart, workflowEnd);

  assert.match(workflow, /normalizeAttendantId\(num\(req\.body\?\.atendente_id\)\)/);
  assert.doesNotMatch(workflow, /requireLoggedAttendantId\(req\)/);
  assert.match(
    workflow,
    /awardXpForCashbackRedemption\(\s*req,\s*quickRedemption\.redemptionId,\s*quickRedemption\.redeemedCents,\s*clientId,\s*attendantId,\s*\)/,
  );
  assert.match(
    workflow,
    /awardXpForCashbackRedemption\(req,\s*redemptionId,\s*redeemedCents,\s*clientId,\s*attendantId\)/,
  );

  const firstCommit = workflow.indexOf("await quickClient.query('COMMIT')");
  const firstXp = workflow.indexOf('await awardXpForCashbackRedemption');
  assert.ok(firstCommit >= 0 && firstXp > firstCommit, 'quick voucher XP must run after commit');

  const normalCommit = workflow.lastIndexOf("await client.query('COMMIT')");
  const normalXp = workflow.lastIndexOf('await awardXpForCashbackRedemption');
  assert.ok(normalCommit >= 0 && normalXp > normalCommit, 'regular cashback XP must run after commit');
});

test('cashback redemption XP belongs to the selected responsible user', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const helperStart = serverSource.indexOf('async function awardXpForCashbackRedemption');
  const helperEnd = serverSource.indexOf('async function awardXpForQuickVoucherIssue', helperStart);
  const helper = serverSource.slice(helperStart, helperEnd);

  assert.match(helper, /coreUserIdForAttendant\(attendantId\)/);
  assert.match(helper, /cashbackRedemptionXpReward\(redemptionId\)/);
  assert.match(helper, /beneficiaryUserId: beneficiaryUserId \?\? 0/);
});
