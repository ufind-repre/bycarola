const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core.js');
const D = require('../integration-core.js');
const C = require('../checks-core.js');
const copy = value => JSON.parse(JSON.stringify(value));
const fresh = () => C.ensureState(D.migrate(F.seed()));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const data = (overrides = {}) => ({person: 'Emitente independente', number: '00981', bank: 'Banco exemplo', amount: 350, due: F.offset(15), receivedDate: F.today, ...overrides});

test('situações finais são exatamente as seis solicitadas', () => {
  assert.deepEqual(C.STATUSES, ['Em carteira', 'Depositado', 'Compensado', 'Substituído', 'Cancelado', 'Descontado']);
});
test('migração é idempotente e preserva datas, fotos, situações e históricos legados', () => {
  const s = F.seed(), old = s.checks[0];
  old.status = 'Devolvido'; old.photo = png; old.history = [{date: '2020-03-04', status: 'Devolvido', note: 'Registro antigo'}];
  const originalId = old.id;
  C.ensureState(s);
  assert.equal(old.status, 'Devolvido'); assert.equal(old.photo, png); assert.equal(old.history[0].status, 'Devolvido');
  assert.equal(old.history[0].date, '2020-03-04'); assert.equal(old.history[0].note, 'Registro antigo');
  assert.equal(old.history[0].at, null); assert.equal(old.history[0].actorId, null); assert.equal(old.history[0].actorName, null);
  for (const field of ['receivedDate', 'representativeId', 'representativeName', 'consignmentId', 'createdAt', 'updatedAt']) assert.equal(old[field], null, field);
  const before = copy(s); C.ensureState(s); C.ensureState(s); assert.deepEqual(s, before);
  assert.equal(C.list(s, {status: 'Devolvido'})[0].id, originalId);
  assert.throws(() => C.setStatus(s, originalId, {status: 'Devolvido', note: 'Não é uma opção nova'}), /inválida/);
});
test('cadastro distingue emitente e representante e preserva o vínculo no snapshot', () => {
  const s = fresh(), check = C.save(s, data({representativeId: 'ct2', consignmentId: 'ROM-0101', photo: png}));
  assert.equal(check.person, 'Emitente independente'); assert.equal(check.representativeId, 'ct2'); assert.equal(check.representativeName, 'Tiago Bastos');
  assert.equal(check.consignmentId, 'ROM-0101'); assert.equal(check.status, 'Em carteira');
  const event = check.history[0];
  assert.equal(event.type, 'Cadastro'); assert.equal(event.actorId, 'vin'); assert.equal(event.actorName, 'Vinícius');
  assert.equal(event.snapshot.person, check.person); assert.equal(event.snapshot.representativeName, 'Tiago Bastos');
  assert.equal(event.snapshot.photo.present, true); assert.equal(event.snapshot.photo.mime, 'image/png');
  assert.doesNotMatch(JSON.stringify(check.history), /data:image/);
});
test('edição de representante mantém emitente e documenta nomes e identificadores antes e depois', () => {
  const s = fresh(), first = C.save(s, data({representativeId: 'ct2', consignmentId: 'ROM-0101'}));
  const original = copy(first.history[0]);
  const second = C.save(s, {representativeId: 'ct3', note: 'Recebido pela representante Renata'}, first.id);
  assert.equal(second.person, first.person); assert.equal(second.representativeName, 'Renata Vilar'); assert.equal(second.consignmentId, null);
  const change = second.history.at(-1).changes.find(c => c.field === 'representative');
  assert.deepEqual(change.before, {id: 'ct2', name: 'Tiago Bastos'}); assert.deepEqual(change.after, {id: 'ct3', name: 'Renata Vilar'});
  assert.deepEqual(second.history[0], original);
  s.contacts.find(c => c.id === 'ct2').name = 'Nome posterior';
  assert.deepEqual(C.get(s, first.id).history[0], original);
  const cleared = C.save(s, {representativeId: '', consignmentId: ''}, first.id);
  assert.equal(cleared.representativeId, null); assert.equal(cleared.person, first.person);
});
test('romaneio deve corresponder ao representante e à unidade do cheque', () => {
  const s = fresh();
  s.consignments.push({id: 'ROM-MAR', rep: 'ct2', unit: 'mar', items: [], history: []});
  for (const overrides of [{representativeId: 'ct3', consignmentId: 'ROM-0101'}, {representativeId: '', consignmentId: 'ROM-0101'}, {representativeId: 'ct2', consignmentId: 'ROM-MAR'}, {representativeId: 'ct1'}]) {
    const before = copy(s); assert.throws(() => C.save(s, data(overrides))); assert.deepEqual(s, before);
  }
});
test('filtros por situação, representante, texto e datas são inclusivos e respeitam datas desconhecidas', () => {
  const s = fresh();
  const first = C.save(s, data({representativeId: 'ct2', consignmentId: 'ROM-0101', due: F.offset(3), receivedDate: F.offset(-2)}));
  C.setStatus(s, first.id, {status: 'Depositado'});
  C.save(s, data({number: '00982', person: 'Outro emitente', representativeId: 'ct3', due: F.offset(8)}));
  assert.equal(C.list(s, {status: 'Depositado', representativeId: 'ct2'}).length, 1);
  for (const q of ['00981', 'BANCO EXEMPLO', 'emitente independente', 'tiago', 'ROM-0101']) assert.equal(C.list(s, {q})[0].id, first.id, q);
  assert.equal(C.list(s, {from: F.offset(3), to: F.offset(3), dateField: 'due'})[0].id, first.id);
  const received = C.list(s, {from: F.offset(-2), to: F.offset(-2), dateField: 'receivedDate'});
  assert.equal(received.length, 1); assert.equal(received[0].id, first.id);
  assert.equal(C.list(s, {dateField: 'receivedDate'}).some(c => c.receivedDate === null), true);
  assert.equal(C.list(s, {from: '1900-01-01', to: F.today, dateField: 'receivedDate'}).some(c => c.receivedDate === null), false);
  assert.throws(() => C.list(s, {from: '2025-02-29'}), /válida/);
  assert.throws(() => C.list(s, {from: '2020-01-03', to: '2020-01-02'}), /anterior/);
  assert.throws(() => C.list(s, {dateField: 'createdAt'}), /vencimento ou recebimento/);
});
test('foto antiga é preservada sem upload novo e eventos guardam apenas metadados', () => {
  const s = fresh(), first = C.save(s, data({photo: png}));
  let check = C.save(s, {amount: 400}, first.id); assert.equal(check.photo, png);
  check = C.save(s, {photo: '', amount: 450}, first.id); assert.equal(check.photo, png);
  check = C.save(s, {photo: {size: 0, name: ''}, amount: 460}, first.id); assert.equal(check.photo, png);
  const jpeg = 'data:image/jpeg;base64,aGVsbG8=';
  check = C.save(s, {photo: jpeg}, first.id); assert.equal(check.photo, jpeg);
  const photoChange = check.history.at(-1).changes.find(c => c.field === 'photo');
  assert.equal(photoChange.before.mime, 'image/png'); assert.equal(photoChange.after.mime, 'image/jpeg');
  assert.doesNotMatch(JSON.stringify(check.history), /data:image/);
  check = C.save(s, {removePhoto: true}, first.id); assert.equal(check.photo, '');
});
test('valida tipo e limite da foto e reverte cadastro inválido integralmente', () => {
  const s = fresh();
  for (const photo of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,não é base64', 'https://exemplo/foto.png', 'data:image/png;base64,' + 'AAAA'.repeat(699051)]) {
    const before = copy(s); assert.throws(() => C.save(s, data({photo}))); assert.deepEqual(s, before);
  }
});
test('edição cadastral não altera situação, legado sem recebimento não ganha data inventada', () => {
  const s = fresh(), legacy = s.checks[0];
  const edited = C.save(s, {amount: 300, receivedDate: '', status: 'Cancelado'}, legacy.id);
  assert.equal(edited.receivedDate, null); assert.equal(edited.createdAt, null); assert.equal(edited.status, 'Em carteira');
  assert.ok(edited.updatedAt); assert.equal(edited.history.at(-1).type, 'Alteração');
  const freshCheck = C.save(s, data({status: 'Compensado'})); assert.equal(freshCheck.status, 'Em carteira');
});
test('situação inválida ou sem justificativa não tem efeitos; comentário preserva situação e eventos anteriores', () => {
  const s = fresh(), first = C.save(s, data());
  for (const status of ['Devolvido', 'Pago', 'Substituído', 'Cancelado', 'Descontado']) {
    const before = copy(s); assert.throws(() => C.setStatus(s, first.id, {status})); assert.deepEqual(s, before);
  }
  const deposited = C.setStatus(s, first.id, {status: 'Depositado', date: F.offset(-1)});
  const beforeComment = copy(deposited.history);
  const commented = C.setStatus(s, first.id, {status: 'Depositado', note: 'Banco recebeu o documento'});
  assert.equal(commented.status, 'Depositado'); assert.equal(commented.history.at(-1).type, 'Comentário');
  assert.deepEqual(commented.history.slice(0, -1), beforeComment);
  assert.equal(commented.history.at(-1).changes.length, 0);
  const before = copy(s); assert.throws(() => C.setStatus(s, first.id, {status: 'Depositado'})); assert.deepEqual(s, before);
  const discounted = C.setStatus(s, first.id, {status: 'Descontado', note: 'Desconto registrado para acompanhamento'});
  assert.equal(discounted.status, 'Descontado');
  assert.throws(() => C.setStatus(s, first.id, {status: 'Compensado', date: F.offset(1)}), /até hoje/);
});
test('cadastro valida valor e datas sem impor chave bancária incompleta, mantendo IDs únicos', () => {
  const s = fresh(), first = C.save(s, data());
  const sameBankDetails = C.save(s, data());
  assert.notEqual(sameBankDetails.id, first.id);
  assert.ok(C.save(s, data({person: 'Outro emitente'})));
  assert.equal(C.save(s, {amount: 351}, first.id).id, first.id);
  for (const overrides of [{amount: 0}, {amount: -1}, {due: '2025-02-29'}, {receivedDate: F.offset(1)}, {receivedDate: ''}, {person: ''}, {bank: ''}, {number: ''}]) {
    const before = copy(s); assert.throws(() => C.save(s, data({number: '12345', ...overrides}))); assert.deepEqual(s, before);
  }
  s.sequence = Number(first.id.replace('CH-', '')) - 1;
  const before = copy(s); assert.throws(() => C.save(s, data({number: 'outro número'})), /identificador/); assert.deepEqual(s, before);
});
test('buscar representante considera o nome atual e o histórico sem reescrever eventos antigos', () => {
  const s = fresh(), created = C.save(s, data({representativeId: 'ct2'})), history = copy(created.history);
  s.contacts.find(c => c.id === 'ct2').name = 'Representante renomeado';
  assert.equal(C.list(s, {q: 'Representante renomeado'})[0].id, created.id);
  assert.equal(C.list(s, {q: 'Tiago Bastos'})[0].id, created.id);
  assert.deepEqual(C.get(s, created.id).history, history);
  assert.equal(C.get(s, created.id).representativeName, 'Tiago Bastos');
});
test('permissões e unidades isolam consulta, edição e atualização de situação', () => {
  const s = fresh(), created = C.save(s, data());
  s.user = 'ana'; s.unit = 'mar';
  const ana = F.user(s); ana.permissions.cheques = {view: true, edit: true, export: false};
  assert.equal(C.list(s, {unit: 'all'}).length, 0);
  assert.throws(() => C.list(s, {unit: 'fab'}), /autorizada/);
  assert.throws(() => C.get(s, created.id), /autorizadas/);
  assert.throws(() => C.save(s, {amount: 900}, created.id), /unidade atual/);
  assert.throws(() => C.setStatus(s, created.id, {status: 'Depositado'}), /unidade atual/);
  assert.throws(() => C.save(s, data({unit: 'fab'})), /unidade atual/);
  s.user = 'vin'; s.unit = 'fab'; F.user(s).permissions.cheques.edit = false;
  assert.ok(C.get(s, created.id)); assert.throws(() => C.save(s, data({number: '123'})), /alterar/);
  F.user(s).permissions.cheques.view = false; assert.throws(() => C.list(s), /consultar/);
});
test('vínculos e situações são informativos e nunca liquidam financeiro ou movimentam consignado e estoque', () => {
  const s = fresh(), before = copy({moves: s.moves, orders: s.orders, titles: s.titles, consignments: s.consignments});
  const created = C.save(s, data({representativeId: 'ct2', consignmentId: 'ROM-0101'}));
  C.setStatus(s, created.id, {status: 'Depositado'}); C.setStatus(s, created.id, {status: 'Compensado'});
  C.save(s, {representativeId: 'ct3'}, created.id);
  assert.deepEqual({moves: s.moves, orders: s.orders, titles: s.titles, consignments: s.consignments}, before);
  const result = C.get(s, created.id); result.history[0].note = 'Não persistir';
  assert.notEqual(C.get(s, created.id).history[0].note, 'Não persistir');
});
