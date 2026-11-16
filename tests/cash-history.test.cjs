const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core.js');
const C = require('../integration-core.js');
const H = require('../cash-history-core.js');
const copy = x => JSON.parse(JSON.stringify(x));
const fresh = () => H.ensureState(C.migrate(F.seed()));
const cash = s => s.cash.find(c => c.unit === 'fab');

test('fechamento cria snapshot persistente da sessão e mantém histórico compatível', () => {
  const s = fresh(), c = cash(s), expected = F.cashExpected(s, c.id), session = c.session;
  s.cashMoves.push({id: 'MOV-TEST', cashId: c.id, session, unit: 'fab', date: F.today, amount: 20, type: 'Reforço', reason: 'Troco'});
  const closed = H.close(s, c.id, {counted: expected + 20, note: 'Conferido pelo operador.'});
  assert.equal(c.open, false); assert.equal(s.cashClosings.length, 1);
  assert.equal(closed.session, session); assert.equal(closed.expected, expected + 20); assert.equal(closed.difference, 0);
  assert.equal(closed.closedBy, s.user); assert.equal(closed.closedByName, F.user(s).name);
  assert.equal(closed.movements[0].reason, 'Troco'); assert.ok(Array.isArray(closed.byMethod));
  const entry = c.history.at(-1);
  assert.equal(entry.type, 'Fechamento'); assert.equal(entry.closingId, closed.id); assert.equal(entry.session, session);
  assert.deepEqual(entry.snapshot, closed);
});
test('reabertura, vendas e alterações futuras não modificam o fechamento anterior', () => {
  const s = fresh(), c = cash(s), closed = H.close(s, c.id, {counted: F.cashExpected(s, c.id), note: ''});
  const frozen = copy(closed), sold = closed.sales.find(o => o.items.some(i => i.qty > i.returned));
  H.open(s, c.id, {opening: 50});
  assert.notEqual(c.session, closed.session);
  c.name = 'Nome novo'; F.user(s).name = 'Operador renomeado';
  F.sell(s, {unit: 'fab', client: 'Venda posterior', items: [{product: 'p1', qty: 1}], channel: 'Loja física', method: 'Dinheiro', cashId: c.id, cashSession: c.session});
  if (sold) F.returnSale(s, sold.id, sold.items[0].product, 1, 'Retorno posterior ao fechamento');
  s.products.find(p => p.id === closed.sales[0].items[0].product).name = 'Produto renomeado';
  assert.deepEqual(H.get(s, closed.id), frozen);
  assert.deepEqual(c.history.find(h => h.closingId === closed.id).snapshot, frozen);
  const fromApi = H.get(s, closed.id); fromApi.cashName = 'Não deve persistir';
  assert.equal(H.get(s, closed.id).cashName, frozen.cashName);
});
test('segunda tentativa de fechar a mesma sessão é bloqueada sem criar outro registro', () => {
  const s = fresh(), c = cash(s);
  H.close(s, c.id, {counted: F.cashExpected(s, c.id)});
  const before = copy(s);
  assert.throws(() => H.close(s, c.id, {counted: 0}), /já está fechado/);
  assert.deepEqual(s, before);
});
test('divergência exige observação e falhas revertem toda a operação', () => {
  const s = fresh(), c = cash(s), expected = F.cashExpected(s, c.id), before = copy(s);
  assert.throws(() => H.close(s, c.id, {counted: expected + 10, note: ' '}), /justificar/);
  assert.deepEqual(s, before);
  const closed = H.close(s, c.id, {counted: expected + 10, note: 'Diferença encontrada na contagem.'});
  assert.equal(closed.difference, 10); assert.equal(closed.note, 'Diferença encontrada na contagem.');
});
test('dois fechamentos no mesmo dia mantêm sessões e identificadores distintos', () => {
  const s = fresh(), id = cash(s).id;
  const first = H.close(s, id, {counted: F.cashExpected(s, id)});
  H.open(s, id, {opening: 25});
  const second = H.close(s, id, {counted: 25});
  assert.equal(first.closedDate, second.closedDate); assert.notEqual(first.id, second.id); assert.notEqual(first.session, second.session);
  assert.equal(H.list(s, {from: F.today, to: F.today, cashId: id}).length, 2);
});
test('filtros de data inclusivos e unidade não se limitam à data-base da demonstração', () => {
  const s = fresh(), c = cash(s);
  c.history.push({date: '2020-02-29', type: 'Fechamento', amount: 123, note: 'Registro anterior ao saldo inicial'});
  H.ensureState(s);
  H.close(s, c.id, {counted: F.cashExpected(s, c.id)});
  assert.equal(H.list(s, {from: '2020-02-29', to: '2020-02-29', unit: 'fab'}).length, 1);
  assert.equal(H.list(s, {from: F.today, to: F.today, unit: 'fab'}).length, 1);
  assert.equal(H.list(s, {unit: 'mar'}).length, 0);
  assert.throws(() => H.list(s, {from: '2021-02-29'}), /inicial válida/);
  assert.throws(() => H.list(s, {to: '2020-13-01'}), /final válida/);
  assert.throws(() => H.list(s, {from: '2025-01-02', to: '2025-01-01'}), /anterior/);
});
test('migração legada é única e deixa campos desconhecidos nulos, sem usar a sessão atual', () => {
  const s = fresh(), c = cash(s), name = c.name;
  c.history.push({date: '2020-01-02', type: 'Fechamento', amount: 70, note: 'Original · Diferença R$ 5,00'});
  c.history.push({date: '2020-01-02', type: 'Fechamento', amount: 70, note: 'Outro fechamento no mesmo dia'});
  const currentSession = c.session, opening = c.opening;
  H.ensureState(s); H.ensureState(s);
  assert.equal(s.cashClosings.length, 2);
  for (const legacy of s.cashClosings) {
    assert.equal(legacy.legacy, true); assert.equal(legacy.counted, 70); assert.equal(legacy.cashName, name);
    for (const field of ['opening', 'expected', 'difference', 'salesTotal', 'salesCount', 'sales', 'byMethod', 'movements', 'session', 'closedBy', 'closedByName', 'closedAt']) assert.equal(legacy[field], null, field);
    assert.equal(legacy.closedDate, '2020-01-02');
  }
  assert.equal(c.session, currentSession); assert.equal(c.opening, opening); assert.equal(c.open, true);
  const before = copy(s); H.ensureState(s); assert.deepEqual(s, before);
});
test('migração preserva campos históricos explícitos e recupera snapshot próprio sem duplicar', () => {
  const s = fresh(), c = cash(s);
  c.history.push({date: '2020-01-03', type: 'Fechamento', amount: 80, expected: 75, difference: 5, opening: 30, session: 'OLD-SESSION', closedBy: 'vin', closedByName: 'Nome na época', cashName: 'Caixa antigo', note: 'Conferência'});
  H.ensureState(s);
  const legacy = s.cashClosings[0];
  assert.equal(legacy.expected, 75); assert.equal(legacy.opening, 30); assert.equal(legacy.session, 'OLD-SESSION');
  assert.equal(legacy.closedByName, 'Nome na época'); assert.equal(legacy.cashName, 'Caixa antigo');
  const closed = H.close(s, c.id, {counted: F.cashExpected(s, c.id)});
  s.cashClosings = s.cashClosings.filter(x => x.id !== closed.id);
  H.ensureState(s);
  assert.deepEqual(H.get(s, closed.id), closed);
  H.ensureState(s); assert.equal(s.cashClosings.filter(x => x.id === closed.id).length, 1);
});
test('consulta exige permissão e restringe unidades; operação exige unidade atual e operador', () => {
  const s = fresh(), c = cash(s), closed = H.close(s, c.id, {counted: F.cashExpected(s, c.id)});
  s.user = 'ana'; s.unit = 'mar';
  assert.equal(H.list(s, {unit: 'all'}).length, 0);
  assert.throws(() => H.list(s, {unit: 'fab'}), /autorizada/);
  assert.throws(() => H.get(s, closed.id), /autorizadas/);
  assert.throws(() => H.open(s, c.id, {opening: 0}), /unidade atual/);
  s.user = 'vin'; s.unit = 'fab';
  s.users.find(u => u.id === 'vin').permissions.caixa.edit = false;
  assert.equal(H.list(s).length, 1);
  assert.throws(() => H.open(s, c.id, {opening: 0}), /operar/);
  s.users.find(u => u.id === 'vin').permissions.caixa.edit = true;
  cash(s).users = [];
  assert.throws(() => H.open(s, c.id, {opening: 0}), /autorizado a operar/);
  s.users.find(u => u.id === 'vin').permissions.caixa.view = false;
  assert.throws(() => H.list(s), /consultar/);
});
test('fechamento usa esperado com crédito de troca e preserva venda bruta e diferença recebida', () => {
  const s = fresh(), c = cash(s), before = F.cashExpected(s, c.id);
  const order = F.sell(s, {unit: 'fab', client: 'Troca', items: [{product: 'p1', qty: 1}], channel: 'Loja física', method: 'Dinheiro', cashId: c.id, cashSession: c.session});
  order.creditApplied = 200; order.paidDifference = 89;
  const closed = H.close(s, c.id, {counted: before + 89});
  const snapshot = closed.sales.find(x => x.id === order.id);
  assert.equal(closed.expected, before + 89); assert.equal(closed.difference, 0);
  assert.equal(snapshot.total, 289); assert.equal(snapshot.received, 89); assert.equal(snapshot.creditApplied, 200);
  const method = closed.byMethod.find(m => m.method === 'Dinheiro');
  assert.equal(method.total - method.creditApplied, method.received);
});
