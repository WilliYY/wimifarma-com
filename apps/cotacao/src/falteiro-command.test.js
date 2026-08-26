import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  MAX_FALTEIRO_BATCH_ITEMS,
  formatFalteiroBatchConfirmation,
  formatFalteiroConfirmation,
  parseFalteiroCommand,
  parseFalteiroCommands,
  sanitizeFalteiroCategories,
} from './falteiro-command.js';

test('servidor importa o limite de lote do modulo autoritativo do Falteiro', () => {
  const serverSource = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  const falteiroImport = serverSource.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/falteiro-command\.js['"]/u);
  const encomendaImport = serverSource.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/encomendas\.js['"]/u);
  assert.match(falteiroImport?.[1] || '', /\bMAX_FALTEIRO_BATCH_ITEMS\b/u);
  assert.doesNotMatch(encomendaImport?.[1] || '', /\bMAX_FALTEIRO_BATCH_ITEMS\b/u);
});

const CATEGORIES = ['Urgente', 'Popular', 'Urgente Popular', 'Urgente Falta Cotar', 'Encomenda', 'Falta'];

function parse(message, categories = CATEGORIES) {
  return parseFalteiroCommand(message, { categories });
}

test('reconhece os sinonimos do Falteiro sem diferenciar maiusculas', () => {
  const cases = [
    ['Miauby falteiro losartana', 'falteiro', ''],
    ['miauby falta losartana', 'falta', ''],
    ['MIAUBY FALTOU losartana', 'faltou', ''],
    ['MiAuBy acabou losartana', 'acabou', 'Acabou'],
  ];

  for (const [message, trigger, category] of cases) {
    assert.deepEqual(parse(message), {
      matched: true,
      trigger,
      product: 'Losartana',
      category,
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
    ['Miauby ta faltando losartana 50mg', 'Losartana 50mg', 'Ta faltando'],
    ['Miauby tá faltando losartana 50mg', 'Losartana 50mg', 'Ta faltando'],
    ['Miauby estamos sem dipirona', 'Dipirona', 'Estamos sem'],
    ['Miauby ficou sem ibuprofeno 600mg', 'Ibuprofeno 600mg', 'Ficou sem'],
    ['Miauby sem estoque de nimesulida 100mg', 'Nimesulida 100mg', 'Sem estoque'],
    ['Miauby nao tem mais azitromicina 500mg', 'Azitromicina 500mg', 'Nao tem mais'],
    ['Miauby terminou prednisona 20mg', 'Prednisona 20mg', 'Terminou'],
    ['Miauby precisa comprar losartana 50mg', 'Losartana 50mg', ''],
    ['Miauby precisamos comprar omeprazol 20mg', 'Omeprazol 20mg', ''],
    ['Miauby coloca omeprazol 20mg no falteiro', 'Omeprazol 20mg', ''],
    ['Miauby adiciona no falteiro loratadina 10mg', 'Loratadina 10mg', ''],
    ['Miauby joga cetirizina 10mg no falteiro', 'Cetirizina 10mg', ''],
    ['Miauby amoxicilina 500mg esta em falta', 'Amoxicilina 500mg', 'Esta em falta'],
    ['Miauby o estoque de losartana acabou', 'Losartana', 'Acabou'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
  }
});

test('entende ordem natural e resolve somente categorias cadastradas', () => {
  const cases = [
    ['Miauby falteiro dipirona 500mg popular', 'Dipirona 500mg', 'Popular'],
    ['Miauby acabou amoxicilina 500mg urgente popular', 'Amoxicilina 500mg', 'Urgente Popular | Acabou'],
    ['Miauby acabou amoxicilina 500mg popular urgente', 'Amoxicilina 500mg', 'Urgente Popular | Acabou'],
    ['Miauby coloca losartana 50mg como urgente no falteiro', 'Losartana 50mg', 'Urgente'],
    ['Miauby losartana 50mg acabou, urgente', 'Losartana 50mg', 'Urgente | Acabou'],
    ['Miauby estamos sem dipirona 500mg, coloca popular', 'Dipirona 500mg', 'Popular | Estamos sem'],
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
    ['Miauby urgente falta cotar metformina 850 acabou', 'Urgente Falta Cotar | Acabou'],
    ['Miauby urgente falta cotar acabou metformina 850', 'Urgente Falta Cotar | Acabou'],
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

test('interpreta categorias por conceitos e preserva produto e apresentacao fora de ordem', () => {
  const cases = [
    ['Miauby falta metformina 850 urgente popular', 'Metformina 850', 'Urgente Popular'],
    ['Miauby metformina 850 falta urgente popular', 'Metformina 850', 'Urgente Popular'],
    ['Miauby popular metformina falta 850 urgente', 'Metformina 850', 'Urgente Popular'],
    ['Miauby belfaren cp urgente falta cotar', 'Belfaren cp', 'Urgente Falta Cotar'],
    ['Miauby urgente belfaren falta cotar cp', 'Belfaren cp', 'Urgente Falta Cotar'],
    ['Miauby belfaren precisa cotar urgente porque acabou', 'Belfaren', 'Urgente Falta Cotar | Acabou'],
    ['Miauby acabou bepantol urgente', 'Bepantol', 'Urgente | Acabou'],
    ['Miauby bepantol acabou urgente', 'Bepantol', 'Urgente | Acabou'],
    ['Miauby losartana 50mg falta', 'Losartana 50mg', ''],
    ['Miauby falta losartana 50mg', 'Losartana 50mg', ''],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('entende aliases de categoria sem gravar linguagem natural no produto', () => {
  const cases = [
    ['Miauby belfaren cp urgencia faltando cotacao', 'Belfaren cp', 'Urgente Falta Cotar'],
    ['Miauby belfaren precisa cotar urgente porque acabou', 'Belfaren', 'Urgente Falta Cotar | Acabou'],
    ['Miauby linha popular dipirona 500 mg acabou', 'Dipirona 500 mg', 'Popular | Acabou'],
    ['Miauby com urgencia belfaren cp precisa cotar porque faltou', 'Belfaren cp', 'Urgente Falta Cotar'],
    ['Miauby prioridade belfaren cp para cotar porque acabou', 'Belfaren cp', 'Urgente Falta Cotar | Acabou'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('entende necessidade de reposicao como intencao de Falteiro', () => {
  const cases = [
    ['Miauby precisa repor losartana 50mg', 'Losartana 50mg', ''],
    ['Miauby reposicao de dipirona 500mg', 'Dipirona 500mg', ''],
    ['Miauby comprar omeprazol 20mg', 'Omeprazol 20mg', ''],
    ['Miauby losartana 50mg esta acabando', 'Losartana 50mg', 'Esta acabando'],
    ['Miauby nao temos amoxicilina 500mg', 'Amoxicilina 500mg', 'Nao temos'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
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

test('grava somente Produto e Categoria preservando todo o contexto util', () => {
  const cases = [
    [
      'Miauby falta losartana 50 urgente comprar 5 caixas amanha',
      'Losartana 50',
      'Urgente | Comprar 5 caixas | Amanha',
    ],
    [
      'Miauby losartana 50 esta acabando urgente comprar 5 caixas amanha',
      'Losartana 50',
      'Urgente | Esta acabando | Comprar 5 caixas | Amanha',
    ],
    [
      'Miauby losartana 50 urgente popular esta acabando comprar 10',
      'Losartana 50',
      'Urgente Popular | Esta acabando | Comprar 10',
    ],
    [
      'Miauby amanha ate 8 reais comprar 5 caixas urgente losartana 50 EMS porque esta acabando e vende muito',
      'Losartana 50 EMS',
      'Urgente | Esta acabando | Vende muito | Comprar 5 caixas | Amanha | Ate R$ 8',
    ],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('diferencia apresentacao do produto da quantidade a comprar em qualquer setor', () => {
  const cases = [
    ['Miauby falta metformina 850mg 30cp comprar 5 caixas', 'Metformina 850mg 30cp', 'Comprar 5 caixas'],
    ['Miauby falta dipirona gotas 20ml comprar 3 frascos', 'Dipirona gotas 20ml', 'Comprar 3 frascos'],
    ['Miauby falta Bepantol Derma 30g comprar 2', 'Bepantol Derma 30g', 'Comprar 2'],
    ['Miauby falta fralda Pampers Confort Sec G 36 unidades comprar 4 pacotes', 'Fralda Pampers Confort Sec G 36 unidades', 'Comprar 4 pacotes'],
    ['Miauby falta nebulizador G-Tech urgente', 'Nebulizador G-Tech', 'Urgente'],
    ['Miauby falta protetor solar Nivea FPS 60 200ml comprar 2', 'Protetor solar Nivea FPS 60 200ml', 'Comprar 2'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('preserva estado atual estoque prazo preco marca e observacoes na Categoria', () => {
  const cases = [
    ['Miauby losartana 50 acabou urgente', 'Losartana 50', 'Urgente | Acabou'],
    ['Miauby omeprazol 20 so temos 2 caixas urgente', 'Omeprazol 20', 'Urgente | So temos 2 caixas'],
    ['MIAUBY omeprazol 20 SO TEM 2 CAIXAS urgente', 'Omeprazol 20', 'Urgente | So tem 2 caixas'],
    ['Miauby omeprazol 20 tem meia caixa', 'Omeprazol 20', 'Tem meia caixa'],
    ['Miauby omeprazol 20 falta comprar 10 se estiver ate 4 reais', 'Omeprazol 20', 'Comprar 10 | Ate R$ 4'],
    ['Miauby falta losartana 50 se tiver EMS melhor', 'Losartana 50', 'Preferir EMS'],
    ['Miauby falta losartana 50 EMS', 'Losartana 50 EMS', ''],
    ['Miauby falta losartana 50 somente EMS', 'Losartana 50', 'Somente EMS'],
    ['Miauby falta losartana 50 qualquer laboratorio', 'Losartana 50', 'Qualquer laboratorio'],
    ['Miauby falta bismujet muita gente esta procurando urgente', 'Bismujet', 'Urgente | Muita gente esta procurando'],
    ['Miauby falta losartana 50 porque vende muito pega 5 caixas amanha', 'Losartana 50', 'Vende muito | Pegar 5 caixas | Amanha'],
    ['Miauby falta dipirona 500mg nao pegar validade curta', 'Dipirona 500mg', 'Nao pegar validade curta'],
    ['Miauby falta dipirona 500mg nao substituir', 'Dipirona 500mg', 'Nao substituir'],
    ['Miauby falta dipirona 500mg pegar bastante', 'Dipirona 500mg', 'Pegar bastante'],
    ['Miauby falta dipirona 500mg nao precisa muitas', 'Dipirona 500mg', 'Nao precisa muitas'],
    ['Miauby falta dipirona 500mg comprar se tiver promocao', 'Dipirona 500mg', 'Comprar se tiver promocao'],
    ['Miauby falta dipirona 500mg cliente reclama dessa marca', 'Dipirona 500mg', 'Cliente reclama dessa marca'],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parse(message);
    assert.equal(parsed?.product, product, message);
    assert.equal(parsed?.category, category, message);
    assert.equal(parsed?.error, '', message);
  }
});

test('diferencia demanda geral de reserva para pessoa especifica', () => {
  assert.deepEqual(parse('Miauby tres clientes perguntaram por bismujet e nao temos'), {
    matched: true,
    trigger: 'sem_estoque',
    product: 'Bismujet',
    category: 'Muita procura | Nao temos',
    error: '',
  });

  assert.equal(parse('Miauby encomenda bismujet para Maria'), null);
  assert.equal(parse('Miauby Maria pediu bismujet porque acabou'), null);
});

test('bloqueia negacao da acao sem perder uma restricao negativa util', () => {
  assert.equal(parse('Miauby losartana nao acabou'), null);
  assert.equal(parse('Miauby nao coloca dipirona no falteiro'), null);

  assert.deepEqual(parse('Miauby metformina esta acabando mas nao e urgente'), {
    matched: true,
    trigger: 'acabando',
    product: 'Metformina',
    category: 'Esta acabando | Nao urgente',
    error: '',
  });
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

test('separa varios produtos por virgula ponto e virgula e quebra de linha', () => {
  const cases = [
    'Miauby falta losartana 50mg, amitriptilina, sal de fruta eno, creme de pentear da loreal',
    'Miauby falta losartana 50mg; amitriptilina; sal de fruta eno; creme de pentear da loreal',
    'Miauby falta\nlosartana 50mg\namitriptilina\nsal de fruta eno\ncreme de pentear da loreal',
  ];

  for (const message of cases) {
    const parsed = parseFalteiroCommands(message, { categories: CATEGORIES });
    assert.equal(parsed?.detectedCount, 4, message);
    assert.deepEqual(
      parsed?.items.map((item) => [item.product, item.category, item.error]),
      [
        ['Losartana 50mg', '', ''],
        ['Amitriptilina', '', ''],
        ['Sal de fruta Eno', '', ''],
        ["Creme de pentear L'Oreal", '', ''],
      ],
      message,
    );
  }
});

test('preserva uma lista de medicamentos com um produto por linha', () => {
  const parsed = parseFalteiroCommands([
    'Miauby falta flancox 400',
    'clenil 250',
    'prolopa bd 100/25',
    'flutinol',
    'mesigyna',
    'repopil 3 cartela',
    'benegrip cartela',
    'flancox 600',
  ].join('\n'), { categories: CATEGORIES });

  assert.equal(parsed?.detectedCount, 8);
  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.error]),
    [
      ['Flancox 400', ''],
      ['Clenil 250', ''],
      ['Prolopa bd 100/25', ''],
      ['Flutinol', ''],
      ['Mesigyna', ''],
      ['Repopil 3 cartela', ''],
      ['Benegrip cartela', ''],
      ['Flancox 600', ''],
    ],
  );
});

test('herda a intencao global sem exigir comando em cada item', () => {
  const parsed = parseFalteiroCommands(
    'Miauby losartana 50mg urgente, amitriptilina urgente falta',
    { categories: CATEGORIES },
  );

  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana 50mg', 'Urgente'],
      ['Amitriptilina', 'Urgente'],
    ],
  );
});

test('mantem apresentacao e marca no produto e contexto proprio em cada item', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta\nlosartana 50mg urgente\ndipirona 500mg 20 comprimidos\nlimpador de vidro comprar amanha\nfralda Pampers Confort Sec G 36 unidades',
    { categories: CATEGORIES },
  );

  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana 50mg', 'Urgente'],
      ['Dipirona 500mg 20 comprimidos', ''],
      ['Limpador de vidro', 'Comprar amanha'],
      ['Fralda Pampers Confort Sec G 36 unidades', ''],
    ],
  );
});

test('nao separa virgula decimal e nao duplica item unico', () => {
  const batch = parseFalteiroCommands('Miauby falta omeprazol 20mg se estiver ate 4,50 reais', { categories: CATEGORIES });
  assert.equal(batch?.detectedCount, 1);
  assert.equal(batch?.items.length, 1);
  assert.equal(batch?.items[0].product, 'Omeprazol 20mg');
  assert.equal(batch?.items[0].category, 'Ate R$ 4,50');

  const single = parseFalteiroCommands('Miauby falta losartana 50mg', { categories: CATEGORIES });
  assert.equal(single?.detectedCount, 1);
  assert.equal(single?.items.length, 1);
  assert.equal(single?.items[0].product, 'Losartana 50mg');
});

test('preserva erro por item para impedir conclusao parcial do lote', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta losartana 50mg urgente, dipirona 500mg popular',
    { categories: ['Urgente'] },
  );

  assert.equal(parsed?.detectedCount, 2);
  assert.equal(parsed?.items[0].error, '');
  assert.equal(parsed?.items[1].error, 'category_not_found');
  assert.equal(parsed?.error, 'category_not_found');
});

test('monta uma confirmacao unica e legivel para o lote', () => {
  assert.equal(
    formatFalteiroBatchConfirmation([
      { product: 'Losartana 50mg', category: 'Urgente' },
      { product: 'Amitriptilina', category: '' },
    ]),
    '✅ 2 itens adicionados ao Falteiro:\n- Losartana 50mg — Urgente\n- Amitriptilina',
  );
});

test('corrige apenas erro simples quando o produto conhecido tem correspondencia unica', () => {
  const parsed = parseFalteiroCommands("Miauby falta amitriptlina, produto inventadoo, creme de pentear da loreal", {
    categories: CATEGORIES,
    knownProducts: ['Amitriptilina 25mg', 'Amoxicilina 500mg'],
  });

  assert.equal(parsed?.items[0].product, 'Amitriptilina');
  assert.equal(parsed?.items[1].product, 'Produto inventadoo');
  assert.equal(parsed?.items[2].product, "Creme de pentear L'Oreal");
});

test('rejeita lote excessivo inteiro antes de qualquer escrita', () => {
  const products = Array.from({ length: MAX_FALTEIRO_BATCH_ITEMS + 1 }, (_value, index) => `produto ${index + 1}`);
  const parsed = parseFalteiroCommands(`Miauby falta ${products.join(', ')}`, { categories: CATEGORIES });
  assert.equal(parsed?.detectedCount, MAX_FALTEIRO_BATCH_ITEMS + 1);
  assert.equal(parsed?.error, 'too_many_items');
  assert.deepEqual(parsed?.items, []);
});

test('interpreta varios itens longos sem misturar o contexto local', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta detergente omo 500ml para limpar o estoque porque acabou, creme de pentear loreal para cabelo cacheado que a maria pediu, losartana 50mg urgente porque so tem uma caixa, eno tradicional comprar umas cinco caixas',
    { categories: CATEGORIES },
  );

  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Detergente OMO 500ml', 'Para limpar o estoque porque acabou'],
      ["Creme de pentear L'Oreal para cabelo cacheado", 'Maria pediu'],
      ['Losartana 50mg', 'Urgente | So tem uma caixa'],
      ['Eno tradicional', 'Comprar umas cinco caixas'],
    ],
  );
});

test('segmenta conectores naturais, bullets e numeracao sem quebrar produto composto', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta:\n1. losartana 50mg\n- amitriptilina 25mg\n• sal de fruta eno\ne tambem kit shampoo e condicionador elseve',
    { categories: CATEGORIES },
  );

  assert.deepEqual(
    parsed?.items.map((item) => item.product),
    [
      'Losartana 50mg',
      'Amitriptilina 25mg',
      'Sal de fruta Eno',
      'Kit shampoo e condicionador Elseve',
    ],
  );
});

test('resolve modificador coletivo somente quando a referencia global e explicita', () => {
  const collective = parseFalteiroCommands(
    'Miauby falta losartana, atenolol e amitriptilina, todos urgente',
    { categories: CATEGORIES },
  );
  assert.deepEqual(
    collective?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana', 'Urgente'],
      ['Atenolol', 'Urgente'],
      ['Amitriptilina', 'Urgente'],
    ],
  );

  const local = parseFalteiroCommands(
    'Miauby falta losartana urgente, atenolol, amitriptilina',
    { categories: CATEGORIES },
  );
  assert.deepEqual(
    local?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana', 'Urgente'],
      ['Atenolol', ''],
      ['Amitriptilina', ''],
    ],
  );
});

test('preserva apresentacao e separa a quantidade operacional de compra', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta dipirona 500mg caixa com 20 comprimidos comprar 5 caixas',
    { categories: CATEGORIES },
  );

  assert.equal(parsed?.items[0].product, 'Dipirona 500mg caixa com 20 comprimidos');
  assert.equal(parsed?.items[0].category, 'Comprar 5 caixas');
});

test('entende finalidade operacional sem retirar caracteristica comercial do produto', () => {
  const cases = [
    [
      'Miauby falta detergente de limpeza da omo para usar na limpeza do banheiro da farmacia',
      'Detergente de limpeza OMO',
      'Para usar na limpeza do banheiro da farmacia',
    ],
    [
      'Miauby falta creme de pentear loreal para cabelos cacheados que a cliente maria pediu para amanha',
      "Creme de pentear L'Oreal para cabelos cacheados",
      'Cliente Maria pediu para amanha',
    ],
    [
      'Miauby falta bobina de papel para impressora termica porque esta acabando',
      'Bobina de papel para impressora termica',
      'Esta acabando',
    ],
  ];

  for (const [message, product, category] of cases) {
    const parsed = parseFalteiroCommands(message, { categories: CATEGORIES });
    assert.equal(parsed?.items[0].product, product, message);
    assert.equal(parsed?.items[0].category, category, message);
  }
});

test('mantem metadados de auditoria e confianca por item interpretado', () => {
  const parsed = parseFalteiroCommands('Miauby falta losartana 50mg urgente', { categories: CATEGORIES });
  const item = parsed?.items[0];

  assert.equal(item?.rawText, 'Miauby falta losartana 50mg urgente');
  assert.equal(typeof item?.intentConfidence, 'number');
  assert.equal(typeof item?.segmentationConfidence, 'number');
  assert.equal(typeof item?.productConfidence, 'number');
  assert.ok(item.intentConfidence >= 0 && item.intentConfidence <= 1);
  assert.ok(item.segmentationConfidence >= 0 && item.segmentationConfidence <= 1);
  assert.ok(item.productConfidence >= 0 && item.productConfidence <= 1);
});

test('servidor reserva somente linhas sem qualquer item ou dado preenchido', () => {
  const serverSource = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  const availableRowsQuery = serverSource.match(/const available = await client\.query\(\s*`([\s\S]*?)`/u)?.[1] || '';

  assert.match(availableRowsQuery, /jsonb_each_text/u);
  assert.match(availableRowsQuery, /btrim\(COALESCE\(entry\.value, ''\)\) <> ''/u);
  assert.match(availableRowsQuery, /NOT EXISTS/u);
});

test('remove o comando no final sem deixar palavras de controle no produto', () => {
  const parsed = parseFalteiroCommands(
    'Miauby losartana 50mg, atenolol 25mg coloca na falta',
    { categories: CATEGORIES },
  );

  assert.deepEqual(parsed?.items.map((item) => item.product), ['Losartana 50mg', 'Atenolol 25mg']);
});

test('usa conectores naturais como fronteira quando os dois lados sao produtos', () => {
  const parsed = parseFalteiroCommands(
    'Miauby acabou losartana 50mg e tambem esta precisando de detergente omo para limpar o chao',
    { categories: CATEGORIES },
  );

  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana 50mg', 'Acabou'],
      ['Detergente OMO', 'Para limpar o chao'],
    ],
  );
});

test('segmenta lista sem pontuacao somente quando encontra produtos conhecidos confiaveis', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta losartana 50mg urgente amitriptilina 25mg urgente eno tradicional e detergente omo para limpeza',
    {
      categories: CATEGORIES,
      knownProducts: ['Losartana 50mg', 'Amitriptilina 25mg', 'Eno tradicional', 'Detergente OMO'],
    },
  );

  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana 50mg', 'Urgente'],
      ['Amitriptilina 25mg', 'Urgente'],
      ['Eno tradicional', ''],
      ['Detergente OMO para limpeza', ''],
    ],
  );
});

test('entende cliente antes do produto quando a ordem para o Falteiro e explicita', () => {
  const parsed = parseFalteiroCommands(
    'Miauby a maria veio atras de creme de pentear da loreal para cacheado e nao tinha coloca na falta',
    { categories: CATEGORIES },
  );

  assert.equal(parsed?.items[0].product, "Creme de pentear L'Oreal para cacheado");
  assert.equal(parsed?.items[0].category, 'Maria veio atras e nao tinha');
});

test('interpreta a lista realista completa em sete registros independentes', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta losartana 50mg urgente porque saiu a ultima caixa, atenolol 25mg farmacia popular comprar umas dez caixas, amitriptilina 25mg que a dona maria veio procurar hoje, creme de pentear da loreal para cabelos cacheados que uma cliente pediu, detergente omo de 500ml para usar na limpeza do chao do estoque, limpador de vidro veja porque acabou e shampoo elseve reparacao total 5 de 400ml comprar so se tiver promocao',
    { categories: CATEGORIES },
  );

  assert.equal(parsed?.detectedCount, 7);
  assert.deepEqual(
    parsed?.items.map((item) => [item.product, item.category]),
    [
      ['Losartana 50mg', 'Urgente | Porque saiu a ultima caixa'],
      ['Atenolol 25mg', 'Popular | Comprar umas dez caixas'],
      ['Amitriptilina 25mg', 'Dona Maria veio procurar hoje'],
      ["Creme de pentear L'Oreal para cabelos cacheados", 'Uma cliente pediu'],
      ['Detergente OMO 500ml', 'Para usar na limpeza do chao do estoque'],
      ['Limpador de vidro Veja', 'Acabou'],
      ['Shampoo Elseve reparacao total 5 400ml', 'So se tiver promocao'],
    ],
  );
});

test('nao transforma continuacao do relato de cliente em outro produto', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta losartana 50mg a dona joana veio procurar e disse que volta depois das quatro',
    { categories: CATEGORIES },
  );

  assert.equal(parsed?.detectedCount, 1);
  assert.equal(parsed?.items[0].product, 'Losartana 50mg');
  assert.equal(parsed?.items[0].category, 'Dona Joana veio procurar e disse que volta depois das quatro');
});

test('nao divide finalidade operacional que usa a conjuncao e', () => {
  const parsed = parseFalteiroCommands(
    'Miauby falta detergente omo para limpar o chao e o banheiro da farmacia',
    { categories: CATEGORIES },
  );

  assert.equal(parsed?.detectedCount, 1);
  assert.equal(parsed?.items[0].product, 'Detergente OMO');
  assert.equal(parsed?.items[0].category, 'Para limpar o chao e o banheiro da farmacia');
});
