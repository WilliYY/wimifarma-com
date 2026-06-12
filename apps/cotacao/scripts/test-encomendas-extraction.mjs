import assert from 'node:assert/strict';
import {
  encomendaContextFromValues,
  encomendaTextParts,
  hasEncomendaWord
} from '../src/encomendas.js';

function extract(values) {
  const context = encomendaContextFromValues(values);
  const parts = encomendaTextParts(values);
  return {
    has: context.hasEncomenda,
    produto: context.produto,
    quantidade: context.quantidade,
    obs: context.observacaoEncomenda,
    before: parts.before,
    after: parts.after,
    term: parts.term,
    original: context.originalText
  };
}

const simple = extract({
  produto: 'lisdexanfetamina 50',
  quantidade: '1',
  categoria: 'encomenda'
});
assert.equal(simple.has, true);
assert.equal(simple.produto, 'lisdexanfetamina 50');
assert.equal(simple.quantidade, '1');
assert.equal(simple.obs, '');

const withValue = extract({ categoria: 'encomenda 10' });
assert.equal(withValue.has, true);
assert.equal(withValue.quantidade, '');
assert.equal(withValue.obs, 'R$ 10');

const withPerson = extract({ categoria: 'encomenda Will' });
assert.equal(withPerson.obs, 'Will');

const withPhone = extract({ categoria: 'encomenda 44999999999' });
assert.equal(withPhone.obs, '44999999999');

const beforeWord = extract({ categoria: 'Will encomenda' });
assert.equal(beforeWord.obs, 'Will');

const afterWord = extract({ categoria: 'encomenda Will 10' });
assert.equal(afterWord.obs, 'Will 10');

const productQuantityAndNote = extract({
  produto: 'dipirona',
  quantidade: '1',
  categoria: 'encomenda João 10'
});
assert.equal(productQuantityAndNote.produto, 'dipirona');
assert.equal(productQuantityAndNote.quantidade, '1');
assert.equal(productQuantityAndNote.obs, 'João 10');

const extraSpaces = extract({ categoria: '   encomenda    Will     10   ' });
assert.equal(extraSpaces.obs, 'Will 10');

assert.equal(hasEncomendaWord('encomenda'), true);
assert.equal(hasEncomendaWord('encomendar cliente'), true);
assert.equal(hasEncomendaWord('encomendado'), true);
assert.equal(hasEncomendaWord('encomenda cliente'), true);
assert.equal(hasEncomendaWord('enc. cliente'), true);
assert.equal(extract({ categoria: 'enc. cliente' }).obs, 'cliente');

assert.equal(extract({ categoria: 'urgente pedir hoje' }).has, false);
assert.equal(extract({ produto: '', quantidade: '', categoria: '' }).has, false);

const similarA = extract({ produto: 'dipirona', quantidade: '1', categoria: 'encomenda João 10' });
const similarB = extract({ produto: 'dipirona', quantidade: '1', categoria: 'encomenda João 20' });
assert.equal(similarA.obs, 'João 10');
assert.equal(similarB.obs, 'João 20');

assert.match(productQuantityAndNote.original, /Produto: dipirona/);
assert.match(productQuantityAndNote.original, /Categoria: encomenda João 10/);

console.log('encomendas extraction ok');
