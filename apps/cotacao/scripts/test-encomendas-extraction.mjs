import assert from 'node:assert/strict';
import {
  buildEncomendaRowValues,
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

const contextual = extract({
  produto: 'losartana 50mg 30cp EMS',
  quantidade: '2 caixas',
  categoria: 'Encomenda | Maria | 44998489494 | Urgente - Quantidade: 2 caixas - Endereco: Rua Curitiba 2222 - Tipo: Entrega - Data: amanha - Horario: depois das 18 - Referencia: perto da igreja - Obs: ligar antes'
});
assert.equal(contextual.produto, 'losartana 50mg 30cp EMS');
assert.equal(contextual.quantidade, '2 caixas');
assert.match(contextual.obs, /Maria/);
assert.match(contextual.obs, /Rua Curitiba 2222/);
assert.match(contextual.obs, /depois das 18/);
assert.match(contextual.obs, /ligar antes/);

const rowValues = buildEncomendaRowValues({
  produto: 'losartana 50mg 30cp EMS',
  categoria: 'Encomenda | Urgente | 2 caixas | Maria | 44 99848-9494 | Rua Curitiba 2222 | Entregar amanha depois das 18 | Perto da igreja | Ligar antes'
});
assert.deepEqual(rowValues, {
  produto: 'losartana 50mg 30cp EMS',
  categoria: 'Encomenda | Urgente | 2 caixas | Maria | 44 99848-9494 | Rua Curitiba 2222 | Entregar amanha depois das 18 | Perto da igreja | Ligar antes'
});
assert.equal(Object.hasOwn(rowValues, 'quantidade'), false);

const legacyPayload = buildEncomendaRowValues({
  produto: 'dipirona 500mg',
  quantidade: '3 unidades',
  responsavel: 'Maria',
  telefone: '44998489494',
  categoriaExtra: 'Quantidade: 3 unidades - Data: amanha'
});
assert.equal(legacyPayload.produto, 'dipirona 500mg');
assert.equal(Object.hasOwn(legacyPayload, 'quantidade'), false);
assert.equal(legacyPayload.categoria, 'Encomenda | Maria | 44998489494 | Quantidade: 3 unidades - Data: amanha');

const categoryWithoutPrefix = buildEncomendaRowValues({
  produto: 'Nebulizador G-Tech',
  categoria: 'Retirar amanha'
});
assert.equal(categoryWithoutPrefix.categoria, 'Encomenda | Retirar amanha');

assert.match(productQuantityAndNote.original, /Produto: dipirona/);
assert.match(productQuantityAndNote.original, /Categoria: encomenda João 10/);

console.log('encomendas extraction ok');
