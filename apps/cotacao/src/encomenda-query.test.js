import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decorateEncomendaReadItem,
  filterEncomendaReadItems,
  parseEncomendaReadQuery
} from './encomenda-query.js';

const LOSARTANA = {
  rowId: 'row-1',
  produto: 'Losartana 50mg EMS',
  quantidade: '2 caixas',
  categoria: 'Encomenda | Urgente | 2 caixas | Maria Silva | (44) 99848-9494 | Rua Curitiba 2222 | Entregar amanha depois das 18',
  observacaoEncomenda: 'Urgente | 2 caixas | Maria Silva | (44) 99848-9494 | Rua Curitiba 2222 | Entregar amanha depois das 18',
  textoCompleto: 'Produto: Losartana 50mg EMS | Categoria: Encomenda | Urgente | 2 caixas | Maria Silva | (44) 99848-9494 | Rua Curitiba 2222 | Entregar amanha depois das 18',
  reminder: { status: 'pendente' }
};

test('reconhece consultas naturais de encomenda sem depender da ordem', () => {
  for (const message of [
    'Miauby quais encomendas tem ai?',
    'Miauby tem encomenda?',
    'MIAUBY mostra as encomendas',
    'Miauby quais pedidos estao encomendados?',
    'Miauby o que tem encomendado?',
    'Miauby quero ver as encomendas',
    'Miauby encomenda da Maria',
    'Miauby encomenda de atenolol farmacia popular',
    'Miauby tem alguma encomenda pendente?',
    'Miauby encomendas?'
  ]) {
    assert.ok(parseEncomendaReadQuery(message), `Consulta nao reconhecida: ${message}`);
  }
});

test('separa consulta de criacao e nunca promove escrita', () => {
  for (const message of [
    'Miauby encomenda losartana 50mg para Maria',
    'Miauby encomenda losartana 50mg para Maria?',
    'Miauby faz uma encomenda de atenolol para Maria',
    'Miauby nova encomenda de dipirona para Joao',
    'Miauby cadastra encomenda de dipirona?',
    'Miauby anota encomenda de losartana',
    'Miauby coloca losartana na encomenda da Maria',
    'Miauby registra uma encomenda de dipirona'
  ]) {
    assert.equal(parseEncomendaReadQuery(message), null, `Criacao confundida com consulta: ${message}`);
  }
  assert.equal(parseEncomendaReadQuery('Miauby quais pedidos tem?'), null);
});

test('extrai escopo, status, campo solicitado e filtros livres', () => {
  const query = parseEncomendaReadQuery('Miauby qual e o telefone da encomenda de losartana da Maria?');
  assert.ok(query);
  assert.equal(query.requestedField, 'phone');
  assert.deepEqual(query.terms, ['losartana', 'maria']);

  const historical = parseEncomendaReadQuery('Miauby mostra todas as encomendas canceladas antigas');
  assert.ok(historical);
  assert.equal(historical.scope, 'history');
  assert.equal(historical.status, 'cancelado');
  assert.equal(historical.order, 'oldest');

  const natural = parseEncomendaReadQuery('Miauby quais pedidos estao encomendados?');
  assert.ok(natural);
  assert.deepEqual(natural.terms, []);

  const open = parseEncomendaReadQuery('Miauby quais encomendas estao abertas?');
  assert.ok(open);
  assert.equal(open.status, 'active');
  assert.deepEqual(open.terms, []);

  const wantToSee = parseEncomendaReadQuery('Miauby quero ver as encomendas');
  assert.ok(wantToSee);
  assert.deepEqual(wantToSee.terms, []);
});

test('ignora vicios de fala em consulta geral e preserva toda a lista ativa', () => {
  for (const message of [
    'o que tem de encomenda e tal?',
    'o que tem de encomendas e tals?'
  ]) {
    const query = parseEncomendaReadQuery(message);
    assert.ok(query);
    assert.deepEqual(query.terms, []);
    assert.deepEqual(filterEncomendaReadItems([LOSARTANA], query).map((item) => item.rowId), ['row-1']);
  }
});

test('preserva detalhes reais e identifica somente campos confiaveis', () => {
  const item = decorateEncomendaReadItem(LOSARTANA);
  assert.equal(item.cliente, 'Maria Silva');
  assert.equal(item.telefone, '(44) 99848-9494');
  assert.equal(item.endereco, 'Rua Curitiba 2222');
  assert.equal(item.previsao, 'Entregar amanha depois das 18');
  assert.equal(item.status, 'pendente');
  assert.equal(item.detalhes, LOSARTANA.categoria);

  const legacy = decorateEncomendaReadItem({
    rowId: 'row-legacy',
    produto: 'Atenolol 50mg',
    categoria: 'Maria 44 99999-9999 Rua Curitiba 2222 cliente vem amanha urgente'
  });
  assert.equal(legacy.telefone, '44 99999-9999');
  assert.equal(legacy.cliente, '');
  assert.equal(legacy.endereco, '');
  assert.equal(legacy.detalhes, 'Maria 44 99999-9999 Rua Curitiba 2222 cliente vem amanha urgente');
});

test('filtra parcialmente por produto, cliente, telefone, contexto e status', () => {
  const items = [
    decorateEncomendaReadItem(LOSARTANA),
    decorateEncomendaReadItem({
      rowId: 'row-2',
      produto: 'Dipirona 500mg',
      categoria: 'Encomenda | Joao | 44 91234-0000 | Retirar sexta',
      reminder: { status: 'cancelado' }
    })
  ];

  const combined = parseEncomendaReadQuery('Miauby procura encomenda losar da Maria');
  assert.ok(combined);
  assert.deepEqual(filterEncomendaReadItems(items, combined).map((item) => item.rowId), ['row-1']);

  const phone = parseEncomendaReadQuery('Miauby procura encomenda 99848-9494');
  assert.ok(phone);
  assert.deepEqual(filterEncomendaReadItems(items, phone).map((item) => item.rowId), ['row-1']);

  const active = parseEncomendaReadQuery('Miauby quais encomendas tem?');
  assert.ok(active);
  assert.deepEqual(filterEncomendaReadItems(items, active).map((item) => item.rowId), ['row-1']);

  const canceled = parseEncomendaReadQuery('Miauby mostra encomendas canceladas');
  assert.ok(canceled);
  assert.deepEqual(filterEncomendaReadItems(items, canceled).map((item) => item.rowId), ['row-2']);

  const finished = parseEncomendaReadQuery('Miauby mostra encomendas finalizadas');
  assert.ok(finished);
  assert.deepEqual(filterEncomendaReadItems(items, finished).map((item) => item.rowId), ['row-2']);
});

test('reconsulta uma referencia pelo rowId antes de aplicar o limite da resposta', () => {
  const other = {
    ...LOSARTANA,
    rowId: 'row-2',
    produto: 'Atenolol 50mg',
    categoria: 'Encomenda | Joao'
  };
  const query = {
    ...parseEncomendaReadQuery('Miauby mostra todas as encomendas'),
    rowId: 'row-2'
  };

  assert.deepEqual(
    filterEncomendaReadItems([LOSARTANA, other], query).map((item) => item.rowId),
    ['row-2']
  );
});
