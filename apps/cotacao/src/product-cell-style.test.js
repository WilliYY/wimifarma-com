import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearProductCellStyles,
  productCellStyleKeyToClear,
  productCellStyleKeysToClear
} from './product-cell-style.js';

test('limpa a cor manual da celula Produto ao apagar o nome por completo', () => {
  assert.equal(
    productCellStyleKeyToClear({
      rowId: 'row-1',
      columnKey: 'produto',
      previousValue: 'Dipirona 500 mg',
      value: ''
    }),
    'cell:row-1:produto'
  );
  assert.equal(
    productCellStyleKeyToClear({
      rowId: 'row-1',
      columnKey: 'produto',
      previousValue: 'Dipirona 500 mg',
      value: '   '
    }),
    'cell:row-1:produto'
  );
});

test('preserva a cor quando o nome do Produto apenas e reescrito', () => {
  assert.equal(
    productCellStyleKeyToClear({
      rowId: 'row-1',
      columnKey: 'produto',
      previousValue: 'Dipirona 500 mg',
      value: 'Dipirona 1 g'
    }),
    null
  );
});

test('nao limpa cor ao preencher Produto vazio nem ao editar outra coluna', () => {
  assert.equal(
    productCellStyleKeyToClear({
      rowId: 'row-1',
      columnKey: 'produto',
      previousValue: '',
      value: 'Losartana'
    }),
    null
  );
  assert.equal(
    productCellStyleKeyToClear({
      rowId: 'row-1',
      columnKey: 'categoria',
      previousValue: 'Urgente',
      value: ''
    }),
    null
  );
});

test('lote retorna somente as cores de Produto realmente apagadas', () => {
  assert.deepEqual(
    productCellStyleKeysToClear([
      { rowId: 'row-1', columnKey: 'produto', previousValue: 'Dipirona', value: '' },
      { rowId: 'row-2', columnKey: 'produto', previousValue: 'Losartana', value: 'Losartana 50 mg' },
      { rowId: 'row-3', columnKey: 'categoria', previousValue: 'Urgente', value: '' },
      { rowId: 'row-4', columnKey: 'produto', previousValue: 'Torsilax', value: '  ' }
    ]),
    ['cell:row-1:produto', 'cell:row-4:produto']
  );
});

test('apaga no banco somente estilos manuais das celulas Produto vazias', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ styleKey: 'cell:row-1:produto' }] };
    }
  };

  const cleared = await clearProductCellStyles(client, 'quote-1', [
    { rowId: 'row-1', columnKey: 'produto', previousValue: 'Dipirona', value: '' },
    { rowId: 'row-2', columnKey: 'produto', previousValue: 'Losartana', value: 'Losartana 50 mg' }
  ]);

  assert.deepEqual(cleared, ['cell:row-1:produto']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /scope = 'cell'/);
  assert.deepEqual(calls[0].params, ['quote-1', ['cell:row-1:produto']]);
});

test('nao consulta o banco quando nenhuma cor deve ser apagada', async () => {
  let queried = false;
  const client = {
    async query() {
      queried = true;
      return { rows: [] };
    }
  };

  const cleared = await clearProductCellStyles(client, 'quote-1', [
    { rowId: 'row-1', columnKey: 'produto', previousValue: 'Dipirona', value: 'Dipirona 1 g' }
  ]);

  assert.deepEqual(cleared, []);
  assert.equal(queried, false);
});
