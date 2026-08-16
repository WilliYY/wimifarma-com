import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasInvalidDailyReportDate,
  inferDailyReportToolRequest,
  reportPeriodArgsFromMessage,
} from './report-routing.js';

test('preserva data exata em DD/MM/AAAA', () => {
  assert.deepEqual(
    reportPeriodArgsFromMessage('relatorio financeiro do dia 15/08/2026'),
    { data: '2026-08-15' },
  );
});

test('preserva periodo mensal existente', () => {
  assert.deepEqual(reportPeriodArgsFromMessage('resumo financeiro 08/2026'), { mes: 8, ano: 2026 });
});

test('rejeita data impossivel sem cair silenciosamente no mes', () => {
  assert.deepEqual(reportPeriodArgsFromMessage('relatorio financeiro do dia 31/02/2026'), {});
  assert.equal(hasInvalidDailyReportDate('relatorio financeiro do dia 31/02/2026'), true);
  assert.equal(hasInvalidDailyReportDate('relatorio financeiro 02/2026'), false);
});

test('roteia relatorios diarios para ferramentas explicitas', () => {
  assert.deepEqual(inferDailyReportToolRequest('relatorio financeiro do dia 15/08/2026'), {
    tool: 'resumo_financeiro',
    args: { data: '2026-08-15' },
  });
  assert.deepEqual(inferDailyReportToolRequest('relatorio cashback do dia 15/08/2026'), {
    tool: 'resumo_cashback',
    args: { data: '2026-08-15' },
  });
  assert.deepEqual(inferDailyReportToolRequest('relatorio tarefas do dia 15/08/2026'), {
    tool: 'resumo_tarefas',
    args: { data: '2026-08-15' },
  });
  assert.deepEqual(inferDailyReportToolRequest('relatorio geral do dia 15/08/2026'), {
    tool: 'resumo_geral',
    args: { data: '2026-08-15' },
  });
});
