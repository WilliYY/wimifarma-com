import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceReportDialog, type ReportDialogState } from './report-dialog.js';

const NOW = new Date('2026-08-16T12:00:00-03:00');

test('asks for both missing report slots', () => {
  const result = advanceReportDialog('relatorio', null, NOW);
  assert.equal(result.kind, 'pending');
  if (result.kind !== 'pending') return;
  assert.deepEqual(result.state, { module: '', date: '' });
  assert.match(result.reply, /Qual relatorio e de qual dia/);
});

test('remembers module and completes with a date-only reply', () => {
  const first = advanceReportDialog('relatorio financeiro', null, NOW);
  assert.equal(first.kind, 'pending');
  if (first.kind !== 'pending') return;
  const second = advanceReportDialog('15/08/2026', first.state, NOW);
  assert.deepEqual(second, {
    kind: 'complete',
    state: { module: 'financeiro', date: '2026-08-15' },
    rewrittenMessage: 'relatorio financeiro do dia 15/08/2026',
  });
});

test('supports the three-step report conversation described by the operator', () => {
  const first = advanceReportDialog('miauby relatorio', null, NOW);
  assert.equal(first.kind, 'pending');
  if (first.kind !== 'pending') return;

  const second = advanceReportDialog('financeiro', first.state, NOW);
  assert.equal(second.kind, 'pending');
  if (second.kind !== 'pending') return;
  assert.deepEqual(second.state, { module: 'financeiro', date: '' });

  const third = advanceReportDialog('dia 15', second.state, NOW);
  assert.deepEqual(third, {
    kind: 'complete',
    state: { module: 'financeiro', date: '2026-08-15' },
    rewrittenMessage: 'relatorio financeiro do dia 15/08/2026',
  });
});

test('remembers date and asks which report', () => {
  const result = advanceReportDialog('relatorio do dia 14/08/2026', null, NOW);
  assert.equal(result.kind, 'pending');
  if (result.kind !== 'pending') return;
  assert.deepEqual(result.state, { module: '', date: '2026-08-14' });
  assert.match(result.reply, /Qual relatorio para 14\/08\/2026/);
});

test('accepts module-only reply after the date was remembered', () => {
  const pending: ReportDialogState = { module: '', date: '2026-08-14' };
  const result = advanceReportDialog('cashback', pending, NOW);
  assert.equal(result.kind, 'complete');
  if (result.kind !== 'complete') return;
  assert.equal(result.rewrittenMessage, 'relatorio cashback do dia 14/08/2026');
});

test('understands relative dates in Sao Paulo', () => {
  const today = advanceReportDialog('relatorio geral de hoje', null, NOW);
  const yesterday = advanceReportDialog('relatorio tarefas de ontem', null, NOW);
  assert.equal(today.kind === 'complete' ? today.state.date : '', '2026-08-16');
  assert.equal(yesterday.kind === 'complete' ? yesterday.state.date : '', '2026-08-15');
});

test('rejects impossible dates without losing pending slots', () => {
  const pending: ReportDialogState = { module: 'financeiro', date: '' };
  const result = advanceReportDialog('31/02/2026', pending, NOW);
  assert.equal(result.kind, 'pending');
  if (result.kind !== 'pending') return;
  assert.equal(result.invalidDate, true);
  assert.deepEqual(result.state, pending);
});

test('accepts a bare day only while a date answer is pending', () => {
  const pending: ReportDialogState = { module: 'cashback', date: '' };
  const followUp = advanceReportDialog('15', pending, NOW);
  const unrelated = advanceReportDialog('15', null, NOW);
  assert.equal(followUp.kind === 'complete' ? followUp.state.date : '', '2026-08-15');
  assert.equal(unrelated.kind, 'none');
});

test('cancels only an active report dialog', () => {
  const pending: ReportDialogState = { module: 'geral', date: '' };
  assert.equal(advanceReportDialog('cancelar', pending, NOW).kind, 'cancelled');
  assert.equal(advanceReportDialog('cancelar', null, NOW).kind, 'none');
});

test('keeps explicit monthly reports on the existing monthly route', () => {
  assert.equal(advanceReportDialog('relatorio financeiro de agosto de 2026', null, NOW).kind, 'none');
  assert.equal(advanceReportDialog('relatorio cashback 08/2026', null, NOW).kind, 'none');
  assert.equal(advanceReportDialog('relatorio geral deste mes', null, NOW).kind, 'none');
});

test('does not label current-only modules as daily reports', () => {
  const result = advanceReportDialog('relatorio cotacao de hoje', null, NOW);
  assert.equal(result.kind, 'pending');
  if (result.kind !== 'pending') return;
  assert.deepEqual(result.state, { module: '', date: '2026-08-16' });
  assert.match(result.reply, /nao possui fechamento por dia/);
  assert.equal(advanceReportDialog('relatorio cotacao', null, NOW).kind, 'none');
});
