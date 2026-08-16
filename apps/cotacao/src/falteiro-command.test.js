import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatFalteiroConfirmation,
  parseFalteiroCommand,
  sanitizeFalteiroCategories,
} from './falteiro-command.js';

const CATEGORIES = ['Urgente', 'Popular', 'Urgente Popular', 'Urgente Falta Cotar', 'Encomenda', 'Falta'];

function parse(message, categories = CATEGORIES) {
  return parseFalteiroCommand(message, { categories });
}

test('reconhece os sinonimos do Falteiro sem diferenciar maiusculas', () => {
  const cases = [
    ['Miauby falteiro losartana', 'falteiro'],
    ['miauby falta losartana', 'falta'],
    ['MIAUBY FALTOU losartana', 'faltou'],
    ['MiAuBy acabou losartana', 'acabou'],
  ];

  for (const [message, trigger] of cases) {
    assert.deepEqual(parse(message), {
      matched: true,
      trigger,
      product: 'Losartana',
      category: '',
      error: '',
    });
  }
});

test('mantem apresentacao no produto e separa prioridade urgente', () => {
  assert.deepEqual(parse('Miauby falta losartana 40mg urgente'), {
    matched: true,
    trigger: 'falta',
    product: 'Losartana 40mg',
    category: 'Urgente',
    error: '',
  });

  assert.deepEqual(parse('miauby: falteiro  dipirona 500mg, prioridade urgencia.'), {
    matched: true,
    trigger: 'falteiro',
    product: 'Dipirona 500mg',
    category: 'Urgente',
    error: '',
  });
});

test('aceita comando direto, pontuacao e falta de produto sem inventar dado', () => {
  assert.deepEqual(parse('falta de amoxicilina 500mg!'), {
    matched: true,
    trigger: 'falta',
    product: 'Amoxicilina 500mg',
    category: '',
    error: '',
  });

  assert.deepEqual(parse('Miauby acabou urgente'), {
    matched: true,
    trigger: 'acabou',
    product: '',
    category: 'Urgente',
    error: 'missing_product',
  });
});

test('entende intencao natural de falta de estoque e necessidade de compra', () => {
  const cases = [
    ['Miauby ta faltando losartana 50mg', 'Losartana 50mg'],
    ['Miauby tá faltando losartana 50mg', 'Losartana 50mg'],
    ['Miauby estamos sem dipirona', 'Dipirona'],
    ['Miauby ficou sem ibuprofeno 600mg', 'Ibuprofeno 600mg'],
    ['Miauby sem estoque de nimesulida 100mg', 'Nimesulida 100mg'],
    ['Miauby nao tem mais azitromicina 500mg', 'Azitromicina 500mg'],
    ['Miauby terminou prednisona 20mg', 'Prednisona 20mg'],
    ['Miauby precisa comprar losartana 50mg', 'Losartana 50mg'],
    ['Miauby precisamos comprar omeprazol 20mg', 'Omeprazol 20mg'],
    ['Miauby coloca omeprazol 20mg no falteiro', 'Omeprazol 20mg'],
    ['Miauby adiciona no falteiro loratadina 10mg', 'Loratadina 10mg'],
    ['Miauby joga cetirizina 10mg no falteiro', 'Cetirizina 10mg'],
    ['Miauby amoxicilina 500mg esta em falta', 'Amoxicilina 500mg'],
    ['Miauby o estoque de losartana acabou', 'Losartana'],
  ];

  for (const [message, product] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, '', message);
  }
});

test('entende ordem natural e resolve somente categorias cadastradas', () => {
  const cases = [
    ['Miauby falteiro dipirona 500mg popular', 'Dipirona 500mg', 'Popular'],
    ['Miauby acabou amoxicilina 500mg urgente popular', 'Amoxicilina 500mg', 'Urgente Popular'],
    ['Miauby acabou amoxicilina 500mg popular urgente', 'Amoxicilina 500mg', 'Urgente Popular'],
    ['Miauby coloca losartana 50mg como urgente no falteiro', 'Losartana 50mg', 'Urgente'],
    ['Miauby losartana 50mg acabou, urgente', 'Losartana 50mg', 'Urgente'],
    ['Miauby estamos sem dipirona 500mg, coloca popular', 'Dipirona 500mg', 'Popular'],
    ['Miauby preciso urgente de amoxicilina 500mg', 'Amoxicilina 500mg', 'Urgente'],
    ['Miauby coloca dipirona 500mg como falta no falteiro', 'Dipirona 500mg', 'Falta'],
    ['Miauby falta omeprazol 20mg encomenda', 'Omeprazol 20mg', 'Encomenda'],
    ['Miauby falta metformina 850mg cotar urgente falta', 'Metformina 850mg', 'Urgente Falta Cotar'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
  }
});

test('resolve categoria composta em qualquer posicao sem contaminar o produto', () => {
  const messages = [
    'Miauby falta metformina 850 urgente popular',
    'Miauby urgente popular metformina 850 falta',
    'Miauby metformina 850 urgente popular falta',
    'Miauby metformina falta urgente popular 850',
    'Miauby popular urgente falta metformina 850',
  ];

  for (const message of messages) {
    assert.deepEqual(parse(message), {
      matched: true,
      trigger: 'falta',
      product: 'Metformina 850',
      category: 'Urgente Popular',
      error: '',
    }, message);
  }
});

test('prefere a categoria real mais especifica e aceita ordem, acento e pontuacao', () => {
  const cases = [
    ['Miauby urgente falta cotar metformina 850 falta', 'Urgente Falta Cotar'],
    ['Miauby urgente falta cotar metformina 850 acabou', 'Urgente Falta Cotar'],
    ['Miauby urgente falta cotar acabou metformina 850', 'Urgente Falta Cotar'],
    ['MIAUBY, COTAR; URGENTE FALTA metformina 850', 'Urgente Falta Cotar'],
    ['Miauby popular urgencia metformina 850 falta', 'Urgente Popular'],
  ];

  for (const [message, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, 'Metformina 850', message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('nao ignora contexto de categoria sem correspondencia cadastrada', () => {
  const parsed = parse('Miauby falta dipirona 500mg popular', ['Urgente']);
  assert.equal(parsed?.product, 'Dipirona 500mg');
  assert.equal(parsed?.category, '');
  assert.equal(parsed?.error, 'category_not_found');
  assert.equal(parsed?.categoryHint, 'popular');
});

test('nao reduz categoria composta inexistente para uma categoria simples', () => {
  const parsed = parse('Miauby falta metformina 850 urgente popular', ['Urgente', 'Popular']);
  assert.equal(parsed?.product, 'Metformina 850');
  assert.equal(parsed?.category, '');
  assert.equal(parsed?.error, 'category_not_found');
  assert.equal(parsed?.categoryHint, 'urgente popular');
});

test('preserva categorias reais e descarta valores que nao sao categoria', () => {
  assert.deepEqual(
    sanitizeFalteiroCategories(['urgente', 'URGENTE', 'Urgente Falta Cotar', '20,94', 'R$ 13,98', '13.98', '', null, 'Encomenda']),
    ['urgente', 'Urgente Falta Cotar', 'Encomenda'],
  );
});

test('nao registra frases ambiguas ou sem relacao clara com o Falteiro', () => {
  const unrelated = [
    'qual produto faltou ontem?',
    'a losartana acabou?',
    'Miauby cotacao losartana',
    'Miauby falta chegar pedido da Profarma',
  ];

  for (const message of unrelated) {
    assert.equal(parse(message), null, message);
  }

  assert.equal(parse('Miauby estamos sem internet'), null);
  assert.equal(parse('Miauby ficou sem energia'), null);
  assert.equal(parse('Miauby nao tem mais tempo'), null);
});

test('monta confirmacao curta sem perder a prioridade', () => {
  assert.equal(
    formatFalteiroConfirmation({ product: 'Losartana 40mg', category: 'Urgente' }),
    '✅ Losartana 40mg adicionada ao Falteiro como Urgente.',
  );
  assert.equal(
    formatFalteiroConfirmation({ product: 'Losartana', category: '' }),
    '✅ Losartana adicionada ao Falteiro.',
  );
});
