import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverUrl = new URL('../src/server.ts', import.meta.url);

test('new client registration selects an eligible attendant and uses one print action', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const sectionStart = serverSource.indexOf('<section id="cadastro"');
  const sectionEnd = serverSource.indexOf('</section>', sectionStart);
  const registrationSection = serverSource.slice(sectionStart, sectionEnd);

  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'new client section should exist');
  assert.match(
    serverSource,
    /normalizeAttendantId\(num\(req\.body\?\.atendente_id\)\)/,
    'backend must validate the selected attendant',
  );
  assert.match(
    registrationSection,
    /attendantSelect\(attendants, 'Atendente responsavel \*', loggedAttendantId, false, true/,
    'responsible attendant must be selectable and required',
  );
  assert.match(registrationSection, /name="print_after_save" value="1"/);
  assert.match(registrationSection, />Cadastrar e imprimir<\/button>/);
  assert.equal((registrationSection.match(/<button type="submit"/g) || []).length, 1);
});

test('client XP is awarded only after the client transaction commits', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const workflowStart = serverSource.indexOf('async function createClientFromDashboard');
  const workflowEnd = serverSource.indexOf('async function createPurchaseFromDashboard', workflowStart);
  const workflow = serverSource.slice(workflowStart, workflowEnd);
  const commitIndex = workflow.indexOf("await client.query('COMMIT')");
  const xpIndex = workflow.indexOf('await awardXpForClientCreation');

  assert.ok(commitIndex >= 0, 'client transaction should commit');
  assert.ok(xpIndex > commitIndex, 'XP must not roll back an already-created client');
  assert.match(workflow, /receipt_origin=cadastro\$\{autoPrintQuery\}/);
});
