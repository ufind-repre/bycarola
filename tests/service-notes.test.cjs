const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core.js');
const D = require('../integration-core.js');
const N = require('../service-notes-core.js');
const copy = value => JSON.parse(JSON.stringify(value));
const fresh = () => D.migrate(F.seed());
const data = (overrides = {}) => ({person: 'Prestador de serviços', providerDocument: '12.345.678/0001-90', reference: 'NFS-001', series: 'A', date: F.today, amount: '123.456', description: 'Serviço de manutenção', due: F.offset(10), method: 'Boleto', bank: '', notes: 'Conferida pelo responsável', ...overrides});

test('registro altera somente notas, títulos, sequência e auditoria, gerando exatamente uma conta a pagar', () => {
  const s = fresh();
  s.stockEntries = [{id: 'STOCK-PRESERVAR'}]; s.goals = {preserve: true};
  const before = copy(s), result = N.register(s, data());
  const changed = Object.keys(s).filter(key => JSON.stringify(s[key]) !== JSON.stringify(before[key])).sort();
  assert.deepEqual(changed, ['activity', 'notes', 'sequence', 'titles']);
  assert.equal(s.notes.length, before.notes.length + 1); assert.equal(s.titles.length, before.titles.length + 1);
  assert.equal(s.sequence, before.sequence + 2); assert.equal(s.activity.length, before.activity.length + 1);
  const {note, payable} = result;
  assert.match(note.id, /^NFS-SERV-/); assert.equal(note.kind, 'Serviço'); assert.equal(note.category, 'service');
  assert.equal(note.person, 'Prestador de serviços'); assert.equal(note.amount, 123.46); assert.equal(note.bank, 'Conta principal');
  assert.equal(note.createdBy, 'vin'); assert.equal(note.createdByName, 'Vinícius'); assert.ok(note.createdAt);
  assert.equal(note.payableId, payable.id); assert.equal(payable.type, 'pagar'); assert.equal(payable.status, 'Aberto');
  assert.equal(payable.amount, note.amount); assert.equal(payable.date, note.date); assert.equal(payable.due, note.due);
  assert.equal(payable.nf, note.id); assert.equal(payable.source, 'service-note'); assert.equal(payable.serviceNoteId, note.id);
  assert.equal(payable.installment, '1/1'); assert.equal(payable.description, note.description);
});
test('permissão fiscal permite gerar a conta sem exigir permissão de editar o financeiro', () => {
  const s = fresh(); F.user(s).permissions.financeiro.edit = false;
  const result = N.register(s, data());
  assert.equal(result.payable.type, 'pagar'); assert.equal(result.payable.status, 'Aberto');
});
test('duplicidade por prestador, número, série e unidade é bloqueada sem novo título ou outro efeito', () => {
  const s = fresh(); N.register(s, data());
  const before = copy(s);
  assert.throws(() => N.register(s, data({person: 'Nome atualizado do mesmo prestador', providerDocument: '12345678000190'})), /já está registrada/);
  assert.deepEqual(s, before);
  assert.ok(N.register(s, data({series: 'B'})));
  assert.ok(N.register(s, data({providerDocument: '98.765.432/0001-10'})));
  N.register(s, data({providerDocument: '', person: 'José da Silva', reference: 'SEM-DOC'}));
  const after = copy(s);
  assert.throws(() => N.register(s, data({providerDocument: '', person: '  JOSE  da silva ', reference: 'SEM-DOC'})), /já está registrada/);
  assert.deepEqual(s, after);
});
test('chave idempotente repetida rejeita nova solicitação sem cadastrar outra conta', () => {
  const s = fresh(); N.register(s, data({idempotencyKey: 'REQUEST-001'}));
  const before = copy(s);
  assert.throws(() => N.register(s, data({reference: 'NFS-OUTRO-NUMERO', idempotencyKey: 'REQUEST-001'})), /solicitação.*já foi registrada/);
  assert.deepEqual(s, before);
});
test('notas de serviço antigas e contas já vencidas não ficam limitadas à data-base do protótipo', () => {
  const s = fresh();
  const {note, payable} = N.register(s, data({date: '2020-02-29', due: '2020-03-01', method: 'Transferência'}));
  assert.equal(note.date, '2020-02-29'); assert.equal(payable.due, '2020-03-01');
  const list = N.list(s, {from: '2020-02-29', to: '2020-02-29'});
  assert.equal(list.length, 1); assert.equal(list[0].id, note.id);
});
test('payload e datas inválidos revertem todo o estado, inclusive sequência e auditoria', () => {
  const s = fresh();
  const invalid = [null, [], {}, data({person: ''}), data({reference: ''}), data({description: ''}), data({amount: 0}), data({amount: -10}), data({amount: 'NaN'}), data({amount: .001}), data({date: F.offset(1)}), data({date: '2025-02-29'}), data({due: '2020-13-01'}), data({method: 'Forma desconhecida'}), data({unit: 'mar'})];
  for (const payload of invalid) {
    const before = copy(s); assert.throws(() => N.register(s, payload)); assert.deepEqual(s, before);
  }
  assert.equal(N.register(s, data({amount: .005})).note.amount, .01);
});
test('mesma nota em unidades diferentes tem contas distintas e consultas respeitam a autorização', () => {
  const s = fresh(); const factory = N.register(s, data());
  s.unit = 'mar'; const retail = N.register(s, data());
  assert.notEqual(factory.note.id, retail.note.id); assert.notEqual(factory.payable.id, retail.payable.id);
  assert.equal(N.list(s).length, 1); assert.equal(N.list(s)[0].unit, 'mar'); assert.equal(N.list(s, {unit: 'all'}).length, 2);
  s.user = 'ana'; F.user(s).permissions.fiscal = {view: true, edit: false, export: false};
  assert.equal(N.list(s, {unit: 'all'}).length, 1); assert.equal(N.get(s, retail.note.id).note.id, retail.note.id);
  assert.throws(() => N.list(s, {unit: 'fab'}), /autorizada/);
  assert.throws(() => N.get(s, factory.note.id), /autorizadas/);
  assert.throws(() => N.register(s, data({reference: 'NOVA'})), /registrar/);
  F.user(s).permissions.fiscal.view = false; assert.throws(() => N.list(s), /consultar/);
});
test('consulta acompanha pagamento do título sem modificar os dados da nota', () => {
  const s = fresh(), {note, payable} = N.register(s, data()), originalNote = copy(note);
  const title = s.titles.find(t => t.id === payable.id);
  title.status = 'Pago'; title.paid = F.today; title.bank = 'Conta de quitação';
  const detail = N.get(s, note.id);
  assert.deepEqual(detail.note, originalNote); assert.equal(detail.payable.status, 'Pago'); assert.equal(detail.payable.bank, 'Conta de quitação');
  assert.equal(N.list(s, {status: 'Aberto'}).length, 0); assert.equal(N.list(s, {status: 'Pago'})[0].payableStatus, 'Pago');
  assert.equal(s.notes.filter(n => n.id === note.id).length, 1); assert.equal(s.titles.filter(t => t.serviceNoteId === note.id).length, 1);
});
test('filtros usam emissão, situação da conta e texto de prestador, descrição e vínculo', () => {
  const s = fresh(), first = N.register(s, data({date: F.offset(-2)}));
  N.register(s, data({reference: 'NFS-002', person: 'Segundo prestador', providerDocument: '', description: 'Outro serviço', date: F.today}));
  const selected = N.list(s, {from: F.offset(-2), to: F.offset(-2), status: 'Aberto'});
  assert.equal(selected.length, 1); assert.equal(selected[0].id, first.note.id);
  for (const q of ['PRESTADOR DE SERVIÇOS', 'NFS-001', 'manutencao', first.note.id, first.payable.id]) assert.equal(N.list(s, {q})[0].id, first.note.id, q);
  const before = copy(s);
  assert.throws(() => N.list(s, {from: '2025-02-29'}));
  assert.throws(() => N.list(s, {from: '2020-02-02', to: '2020-02-01'}));
  assert.throws(() => N.list(s, {status: 'Cancelado'}));
  assert.deepEqual(s, before);
});
test('resultados retornados são cópias e não permitem alterar documentos ou contas por referência', () => {
  const s = fresh(), result = N.register(s, data());
  result.note.amount = 9999; result.payable.status = 'Pago';
  assert.equal(N.get(s, result.note.id).note.amount, 123.46); assert.equal(N.get(s, result.note.id).payable.status, 'Aberto');
  const rows = N.list(s); rows[0].payable.amount = 1; rows[0].description = 'Mutação externa';
  const detail = N.get(s, result.note.id); detail.note.person = 'Outro prestador'; detail.payable.amount = 2;
  assert.equal(N.get(s, result.note.id).note.person, 'Prestador de serviços'); assert.equal(N.get(s, result.note.id).payable.amount, 123.46);
});
