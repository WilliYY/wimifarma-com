import assert from 'node:assert/strict';
import test from 'node:test';

import { interpretSemanticCommand } from './semantic-command.js';

const resolved = (message: string) => interpretSemanticCommand(message, { channel: 'internal' });

const permutationsOfThree = ([first, second, third]: [string, string, string]): string[] => [
  `${first} ${second} ${third}`,
  `${first} ${third} ${second}`,
  `${second} ${first} ${third}`,
  `${second} ${third} ${first}`,
  `${third} ${first} ${second}`,
  `${third} ${second} ${first}`,
];

test('mantem as principais familias sem ordem fixa entre intencao, dados e ativacao', () => {
  const cases: Array<[[string, string, string], string]> = [
    [['losartana 50mg urgente', 'acabou', 'Miauby'], 'registrar_falteiro'],
    [['fornecedor 28,90', 'pix cnpj', 'Miauby'], 'registrar_pix_cnpj'],
    [['troco 30', 'sangria', 'Miauby'], 'registrar_sangria'],
    [['ANB 350', 'pedido registrar', 'Miauby'], 'criar_pedido'],
    [['conferir caixa amanha 15h', 'tarefa criar', 'Miauby'], 'criar_tarefa'],
    [['Rogerio geral 500', 'conta na gestao', 'Miauby'], 'criar_conta_gestao'],
    [['losartana 50mg', 'cotacao urgente', 'Miauby'], 'criar_cotacao_urgente'],
    [['dia 15/08/2026', 'relatorio financeiro', 'Miauby'], 'relatorio_financeiro'],
    [['agosto', 'calendario', 'Miauby'], 'consultar_calendario'],
    [['hoje', 'fechar caixa', 'Miauby'], 'fechar_caixa'],
  ];

  for (const [segments, intent] of cases) {
    for (const message of permutationsOfThree(segments)) {
      const result = resolved(message);
      assert.equal(result.status, 'resolved', message);
      assert.equal(result.intent, intent, message);
    }
  }
});

test('interpreta Falteiro sem depender da ordem ou da caixa', () => {
  const messages = [
    'Miauby falta losartana 50mg urgente',
    'MIAUBY losartana 50mg falta urgente',
    'miauby urgente losartana 50mg falta',
    'Losartana 50mg urgente acabou Miauby',
  ];

  for (const message of messages) {
    const result = resolved(message);
    assert.equal(result.status, 'resolved', message);
    assert.equal(result.intent, 'registrar_falteiro', message);
    assert.match(result.canonical_message, /^falta\b/i, message);
    assert.match(result.canonical_message, /losartana\s+50mg/i, message);
    assert.match(result.canonical_message, /urgente/i, message);
    assert.doesNotMatch(result.canonical_message, /miauby/i, message);
    assert.ok(result.entities.some((entity) => entity.type === 'category' && entity.normalized === 'urgente'), message);
    assert.ok(!result.entities.some((entity) => entity.type === 'category' && entity.normalized === 'falta'), message);
  }
});

test('preserva todos os termos de categoria composta para o parser autoritativo do Falteiro', () => {
  const messages = [
    'Miauby falta metformina 850 urgente popular',
    'Miauby urgente popular metformina 850 falta',
    'Miauby metformina 850 urgente popular falta',
    'Miauby metformina falta urgente popular 850',
    'Miauby popular urgente falta metformina 850',
  ];

  for (const message of messages) {
    const result = resolved(message);
    assert.equal(result.status, 'resolved', message);
    assert.equal(result.intent, 'registrar_falteiro', message);
    assert.match(result.canonical_message, /^falta\b/i, message);
    assert.match(result.canonical_message, /metformina/i, message);
    assert.match(result.canonical_message, /\b850\b/i, message);
    assert.match(result.canonical_message, /urgente/i, message);
    assert.match(result.canonical_message, /popular/i, message);
    assert.ok(result.entities.some((entity) => entity.type === 'category' && entity.normalized === 'urgente'), message);
    assert.ok(result.entities.some((entity) => entity.type === 'category' && entity.normalized === 'popular'), message);
  }
});

test('prioriza Falteiro por ruptura de estoque e preserva aliases para a Cotacao', () => {
  const messages = [
    'Miauby belfaren precisa cotar urgente porque acabou',
    'Miauby belfaren cp urgencia faltando cotacao',
    'Miauby precisa repor losartana 50mg',
    'Miauby reposicao de dipirona 500mg',
    'Miauby comprar omeprazol 20mg',
    'Miauby losartana 50mg esta acabando',
    'Miauby nao temos amoxicilina 500mg',
  ];

  for (const message of messages) {
    const result = resolved(message);
    assert.equal(result.status, 'resolved', message);
    assert.equal(result.intent, 'registrar_falteiro', message);
    assert.match(result.canonical_message, /^falta\b/i, message);
  }

  const compound = resolved(messages[0]);
  assert.match(compound.canonical_message, /belfaren/i);
  assert.match(compound.canonical_message, /cotar/i);
  assert.match(compound.canonical_message, /urgente/i);
});

test('canoniza comandos financeiros com valor em qualquer posicao', () => {
  const sangria = [
    'Miauby sangria 30 troco do caixa',
    'Miauby troco do caixa 30 sangria',
    '30 reais de sangria para troco Miauby',
  ];
  for (const message of sangria) {
    const result = resolved(message);
    assert.equal(result.intent, 'registrar_sangria', message);
    assert.match(result.canonical_message, /^sangria\s+(?:R\$\s*)?30\b/i, message);
  }

  const pix = resolved('Compra fornecedor 28,90, Miauby registra como PIX CNPJ');
  assert.equal(pix.intent, 'registrar_pix_cnpj');
  assert.match(pix.canonical_message, /^pix cnpj\s+28,90\b/i);
  assert.match(pix.canonical_message, /compra fornecedor/i);
});

test('preserva a acao do fechamento de caixa em qualquer ordem', () => {
  const fechar = resolved('Miauby hoje o caixa pode fechar');
  assert.equal(fechar.intent, 'fechar_caixa');
  assert.match(fechar.canonical_message, /^fechar caixa\b/i);

  const reabrir = resolved('O caixa de hoje Miauby abrir novamente');
  assert.equal(reabrir.intent, 'reabrir_caixa');
  assert.match(reabrir.canonical_message, /^reabrir caixa\b/i);

  const consultar = resolved('Miauby o caixa de hoje esta aberto?');
  assert.equal(consultar.intent, 'consultar_fechamento_caixa');
  assert.match(consultar.canonical_message, /^fechamento caixa\b/i);
});

test('canoniza pedidos e tarefas com acao depois dos dados', () => {
  const pedido = resolved('Miauby ANB 350 pedido registrar');
  assert.equal(pedido.intent, 'criar_pedido');
  assert.match(pedido.canonical_message, /^pedido\b/i);
  assert.match(pedido.canonical_message, /ANB/i);
  assert.match(pedido.canonical_message, /350/);

  const cancelarPedido = resolved('ANB 350 Miauby nao precisa mais desse pedido');
  assert.equal(cancelarPedido.intent, 'cancelar_pedido');
  assert.match(cancelarPedido.canonical_message, /^cancelar pedido\b/i);

  const tarefa = resolved('Miauby conferir caixa amanha 15h tarefa criar');
  assert.equal(tarefa.intent, 'criar_tarefa');
  assert.match(tarefa.canonical_message, /^criar tarefa\b/i);
  assert.match(tarefa.canonical_message, /conferir caixa/i);
  assert.match(tarefa.canonical_message, /amanha 15h/i);

  const concluir = resolved('Conferir pedidos Miauby ja terminei a tarefa');
  assert.equal(concluir.intent, 'concluir_tarefa');
  assert.match(concluir.canonical_message, /^concluir tarefa\b/i);
  assert.match(concluir.canonical_message, /conferir pedidos/i);
});

test('canoniza Gestao, Cotacao, relatorio e calendario', () => {
  const gestao = resolved('Miauby Rogerio geral 500 conta na gestao');
  assert.equal(gestao.intent, 'criar_conta_gestao');
  assert.match(gestao.canonical_message, /^gestao\b/i);
  assert.match(gestao.canonical_message, /Rogerio/i);
  assert.match(gestao.canonical_message, /500/);

  const encomenda = resolved('Dipirona 500mg para amanha Miauby criar encomenda');
  assert.equal(encomenda.intent, 'criar_encomenda_cotacao');
  assert.match(encomenda.canonical_message, /^encomenda\b/i);

  const urgente = resolved('Losartana 50mg Miauby colocar na cotacao urgente');
  assert.equal(urgente.intent, 'criar_cotacao_urgente');
  assert.match(urgente.canonical_message, /^cotacao urgente\b/i);

  const relatorio = resolved('Do dia 15/08/2026 financeiro Miauby quero o relatorio');
  assert.equal(relatorio.intent, 'relatorio_financeiro');
  assert.match(relatorio.canonical_message, /^relatorio financeiro\b/i);
  assert.match(relatorio.canonical_message, /15\/08\/2026/);

  const calendario = resolved('Plantao de agosto, Miauby consulte o calendario');
  assert.equal(calendario.intent, 'consultar_calendario');
  assert.match(calendario.canonical_message, /^calendario\b/i);
});

test('extrai entidades gerais sem executar nada', () => {
  const result = resolved('Miauby tarefa para Sueli comprar dipirona 500mg amanha 15h, quantidade 2');
  assert.equal(result.status, 'resolved');
  assert.equal(result.intent, 'criar_tarefa');
  assert.ok(result.entities.some((entity) => entity.type === 'dosage' && /500mg/i.test(entity.value)));
  assert.ok(result.entities.some((entity) => entity.type === 'time' && /15h/i.test(entity.value)));
  assert.ok(result.entities.some((entity) => entity.type === 'quantity' && /2/.test(entity.value)));
  assert.ok(result.entities.some((entity) => entity.type === 'user' && /Sueli/i.test(entity.value)));
});

test('nao confunde conectivos naturais com usuario', () => {
  const result = resolved('Miauby por favor cria tarefa de conferir o caixa amanha');
  assert.equal(result.intent, 'criar_tarefa');
  assert.ok(!result.entities.some((entity) => entity.type === 'user'));
});

test('nao transforma conversa solta em comando operacional', () => {
  assert.equal(resolved('qual produto faltou ontem?').status, 'none');
  assert.equal(resolved('o caixa fica perto da porta').status, 'none');
  assert.equal(resolved('bom dia, tudo bem?').status, 'none');
});

test('bloqueia comando negado sem confundir falta de estoque', () => {
  const sangria = resolved('Miauby nao faca sangria de 30');
  assert.equal(sangria.status, 'blocked');
  assert.equal(sangria.canonical_message, '');
  assert.match(sangria.clarification, /nao vou executar/i);

  const falteiroNegado = resolved('Miauby nao acabou losartana 50mg');
  assert.equal(falteiroNegado.status, 'blocked');

  const faltaReal = resolved('MIAUBY nao tem mais losartana 50mg urgente');
  assert.equal(faltaReal.status, 'resolved');
  assert.equal(faltaReal.intent, 'registrar_falteiro');

  const consultaNegativa = resolved('Miauby nao tem tarefas para hoje?');
  assert.equal(consultaNegativa.status, 'resolved');
  assert.equal(consultaNegativa.intent, 'listar_tarefas');
});

test('pede confirmacao quando a frase apenas pergunta sobre uma acao', () => {
  for (const message of [
    'Miauby como faco uma sangria de 30?',
    'Miauby posso fechar o caixa hoje?',
    'Miauby tem como cancelar o pedido da ANB?',
    'Miauby acabou losartana 50mg?',
    'Miauby coloca losartana 50mg no falteiro?',
  ]) {
    const result = resolved(message);
    assert.equal(result.status, 'ambiguous', message);
    assert.equal(result.canonical_message, '', message);
    assert.match(result.clarification, /voce quer/i, message);
  }

  const consulta = resolved('Miauby o caixa de hoje esta aberto?');
  assert.equal(consulta.status, 'resolved');
  assert.equal(consulta.intent, 'consultar_fechamento_caixa');
});

test('tolera um pequeno erro somente nas palavras do comando ativado', () => {
  const sangria = resolved('Miauby sagria 30 para Maria');
  assert.equal(sangria.status, 'resolved');
  assert.equal(sangria.intent, 'registrar_sangria');
  assert.match(sangria.canonical_message, /^sangria 30/i);

  const pedido = resolved('Miauby cancela peddo 123');
  assert.equal(pedido.status, 'resolved');
  assert.equal(pedido.intent, 'cancelar_pedido');

  assert.equal(resolved('sagria 30 para Maria').status, 'none');
});

test('extrai quantidade natural e data relativa como contexto', () => {
  const result = resolved('Miauby estao faltando tres caixas de dipirona 500mg para amanha');
  assert.equal(result.status, 'resolved');
  assert.equal(result.intent, 'registrar_falteiro');
  assert.ok(result.entities.some((entity) => entity.type === 'quantity' && entity.normalized === '3'));
  assert.ok(result.entities.some((entity) => entity.type === 'date' && entity.normalized === 'amanha'));
});

test('normaliza caixa, acentos e valores brasileiros sem perder o dado original', () => {
  const result = resolved('MÍÁÚBY SÁNGRIA 1.500,20 PARA MARIA');
  assert.equal(result.status, 'resolved');
  assert.equal(result.intent, 'registrar_sangria');
  assert.match(result.canonical_message, /^sangria 1\.500,20 PARA MARIA$/i);
  assert.ok(result.entities.some((entity) => entity.type === 'money' && entity.value === '1.500,20'));
});

test('bloqueia ambiguidade real entre duas acoes destrutivas', () => {
  const result = resolved('Miauby cancelar o pedido e a tarefa');
  assert.equal(result.status, 'ambiguous');
  assert.match(result.clarification, /pedido ou a tarefa/i);
  assert.equal(result.canonical_message, '');
});

test('cobre todas as familias operacionais registradas', () => {
  const cases: Array<[string, string]> = [
    ['Miauby preciso urgente de amoxicilina 500mg', 'registrar_falteiro'],
    ['Miauby fornecedor 28,90 pix cnpj registrar', 'registrar_pix_cnpj'],
    ['Miauby 20 reais troco sangria', 'registrar_sangria'],
    ['Miauby 1500 faturamento de hoje registrar', 'registrar_faturamento_diario'],
    ['Miauby financeiro saida 50 material', 'criar_lancamento_financeiro'],
    ['Miauby hoje fechar o caixa', 'fechar_caixa'],
    ['Miauby caixa abrir novamente', 'reabrir_caixa'],
    ['Miauby caixa de hoje esta aberto', 'consultar_fechamento_caixa'],
    ['Miauby ANB cancelar pedido', 'cancelar_pedido'],
    ['Miauby aguardando chegada mostrar pedidos', 'listar_pedidos_chegada'],
    ['Miauby Nissei 280 pedido novo', 'criar_pedido'],
    ['Miauby conferir caixa cancelar tarefa', 'cancelar_tarefa'],
    ['Miauby conferir caixa terminei a tarefa', 'concluir_tarefa'],
    ['Miauby conferir caixa mostrar tarefa', 'consultar_tarefa'],
    ['Miauby minhas tarefas listar', 'listar_tarefas'],
    ['Miauby conferir caixa tarefa nova', 'criar_tarefa'],
    ['Miauby Rogerio 500 conta na gestao', 'criar_conta_gestao'],
    ['Miauby entrar na gestao', 'abrir_gestao'],
    ['Miauby dipirona para amanha encomenda criar', 'criar_encomenda_cotacao'],
    ['Miauby losartana colocar na cotacao urgente', 'criar_cotacao_urgente'],
    ['Miauby dipirona e losartana montar planilha de cotacao', 'criar_planilha_cotacao'],
    ['Miauby dipirona fazer cotacao rapida', 'criar_cotacao_rapida'],
    ['Miauby dipirona buscar na cotacao', 'consultar_cotacao'],
    ['Miauby dia 15/08/2026 relatorio financeiro', 'relatorio_financeiro'],
    ['Miauby agosto consultar calendario de plantao', 'consultar_calendario'],
  ];

  for (const [message, intent] of cases) {
    const result = resolved(message);
    assert.equal(result.status, 'resolved', message);
    assert.equal(result.intent, intent, message);
  }
});
