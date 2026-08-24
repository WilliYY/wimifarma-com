import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCotacaoEncomendasMessage,
  mightBeFalteiroCommand,
  parseCotacaoEncomendasCommand,
} from './cotacao-command.js';

test('encaminha consultas naturais de encomenda com a frase completa', () => {
  for (const message of [
    'quais encomenda tem?',
    'Miauby quais encomendas tem ai?',
    'Miauby tem encomenda?',
    'MIAUBY mostra as encomendas recentes',
    'Miauby quais pedidos estao encomendados?',
    'Miauby o que tem encomendado?',
    'o que tem de encomenda e tal?',
    'o que tem de encomendas e tals?',
    'Miauby quero ver as encomendas',
    'Miauby encomenda da Maria',
    'Miauby encomenda de atenolol farmacia popular',
  ]) {
    const command = parseCotacaoEncomendasCommand(message);
    assert.ok(command, `Consulta nao reconhecida: ${message}`);
    assert.equal(command.query, message.replace(/^Miauby\s+/i, '').replace(/[?!;]+$/g, '').trim());
  }
  assert.equal(parseCotacaoEncomendasCommand('Miauby mostra as encomendas recentes')?.order, 'newest');
});

test('nao confunde criacao de encomenda com consulta', () => {
  assert.equal(parseCotacaoEncomendasCommand('Miauby encomenda losartana 50mg para Maria'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby encomenda losartana 50mg para Maria?'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby faz uma encomenda de atenolol para Maria'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby nova encomenda de dipirona para Joao'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby cadastra encomenda de dipirona?'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby anota encomenda de losartana'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby coloca losartana na encomenda da Maria'), null);
  assert.equal(parseCotacaoEncomendasCommand('Miauby quais pedidos tem?'), null);
});

test('formata consulta com detalhes reais e resposta especifica sem resultado', () => {
  const text = formatCotacaoEncomendasMessage({
    items: [{
      rowId: 'row-1',
      ean: '',
      produto: 'Losartana 50mg',
      quantidade: '2 caixas',
      categoria: 'Encomenda | Urgente | Maria Silva | (44) 99848-9494 | Rua Curitiba 2222',
      detalhes: 'Encomenda | Urgente | Maria Silva | (44) 99848-9494 | Rua Curitiba 2222',
      cliente: 'Maria Silva',
      telefone: '(44) 99848-9494',
      endereco: 'Rua Curitiba 2222',
      status: 'pendente',
      depoisEncomenda: '',
      createdAtBr: '22/08/2026 14:30',
      createdAt: '2026-08-22T17:30:00.000Z',
    }],
    total: 1,
    returned: 1,
    order: 'oldest',
    filters: { label: 'losartana', scope: 'active', terms: ['losartana'] },
  });
  assert.match(text, /Encontrei 1 encomenda na Cotacao/i);
  assert.match(text, /Losartana 50mg/);
  assert.match(text, /Cliente: Maria Silva/);
  assert.match(text, /Telefone: \(44\) 99848-9494/);
  assert.match(text, /Endereco: Rua Curitiba 2222/);
  assert.match(text, /Status: pendente/);
  assert.match(text, /Detalhes: Encomenda \| Urgente/);

  const empty = formatCotacaoEncomendasMessage({
    items: [], total: 0, returned: 0, order: 'oldest',
    filters: { label: 'atenolol', scope: 'active', terms: ['atenolol'] },
  });
  assert.match(empty, /atenolol/i);
  assert.match(empty, /encontrei/i);
});

test('encaminha candidatos do Falteiro sem diferenciar maiusculas', () => {
  assert.equal(mightBeFalteiroCommand('MIAUBY FALTEIRO losartana'), true);
  assert.equal(mightBeFalteiroCommand('falta losartana 40mg urgente'), true);
  assert.equal(mightBeFalteiroCommand('AcAbOu losartana'), true);
  assert.equal(mightBeFalteiroCommand('Miauby tá faltando losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby estamos sem dipirona'), true);
  assert.equal(mightBeFalteiroCommand('Miauby coloca omeprazol 20mg no falteiro'), true);
  assert.equal(mightBeFalteiroCommand('Miauby precisa comprar losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50mg acabou, urgente'), true);
  assert.equal(mightBeFalteiroCommand('Miauby amoxicilina 500mg está em falta'), true);
  assert.equal(mightBeFalteiroCommand('Miauby o estoque de losartana acabou'), true);
  assert.equal(mightBeFalteiroCommand('Miauby urgente popular metformina 850 falta'), true);
  assert.equal(mightBeFalteiroCommand('Miauby metformina falta urgente popular 850'), true);
  assert.equal(mightBeFalteiroCommand('Miauby precisa repor losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby reposicao de dipirona 500mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby comprar omeprazol 20mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50mg esta acabando'), true);
  assert.equal(mightBeFalteiroCommand('Miauby nao temos amoxicilina 500mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50 zerou'), true);
  assert.equal(mightBeFalteiroCommand('Miauby omeprazol 20 estoque baixo'), true);
  assert.equal(mightBeFalteiroCommand('Miauby dipirona 500mg so tem 2 caixas'), true);
  assert.equal(mightBeFalteiroCommand('Miauby omeprazol 20 tem meia caixa'), true);
  assert.equal(mightBeFalteiroCommand('Miauby protetor Nivea vai acabar'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50mg urgente'), true);
});

test('nao encaminha mensagens sem sinonimo do Falteiro', () => {
  assert.equal(mightBeFalteiroCommand('Miauby cotacao losartana'), false);
  assert.equal(mightBeFalteiroCommand('qual e o relatorio de hoje?'), false);
  assert.equal(mightBeFalteiroCommand('qual produto faltou ontem?'), false);
  assert.equal(mightBeFalteiroCommand('Miauby falta chegar'), false);
  assert.equal(mightBeFalteiroCommand('Miauby relatorio de falta'), false);
  assert.equal(mightBeFalteiroCommand('o estoque de losartana acabou?'), false);
  assert.equal(mightBeFalteiroCommand('Miauby estamos sem internet'), false);
  assert.equal(mightBeFalteiroCommand('losartana 50mg urgente'), false);
  assert.equal(mightBeFalteiroCommand('Miauby cotacao urgente losartana'), false);
});
