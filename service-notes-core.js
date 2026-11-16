/* Registro local de notas de serviço: somente documento e uma conta a pagar. */
(function (root, factory) {
  'use strict';
  const F = root.Fluxo || (typeof require === 'function' ? require('./core.js') : null);
  const api = factory(F);
  root.CarolaServiceNotes = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (F) {
  'use strict';
  if (!F) throw new Error('Carregue core.js antes das notas de serviço.');
  const METHODS = Object.freeze(['Boleto', 'Pix', 'Transferência', 'Cartão', 'Dinheiro', 'Cheque']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
  const normalizeDocument = value => text(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00Z').getTime()) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  const isService = note => note?.kind === 'Serviço' || note?.category === 'service';
  function permit(s, action) {
    const user = F.user(s);
    F.assert(user?.active && F.allow(s, 'fiscal', action), action === 'view' ? 'Este usuário não tem permissão para consultar notas fiscais.' : 'Este usuário não tem permissão para registrar notas fiscais.');
    return user;
  }
  function authorizedUnits(s, selected) {
    const user = permit(s, 'view'), allowed = user.units.filter(id => s.units.some(unit => unit.id === id)), wanted = selected || s.unit;
    F.assert(wanted === 'all' || allowed.includes(wanted), 'A unidade selecionada não está autorizada para este usuário.');
    return wanted === 'all' ? allowed : [wanted];
  }
  function providerKey(note) {
    const document = normalizeDocument(note.providerDocument);
    return document ? 'document:' + document : 'name:' + normalize(note.person);
  }
  function relatedPayable(s, note) {
    return s.titles.find(title => title.id === note.payableId && title.type === 'pagar' && title.serviceNoteId === note.id && title.source === 'service-note' && title.unit === note.unit) || null;
  }
  function register(s, data) {
    return F.atomic(s, () => {
      const user = permit(s, 'edit');
      F.assert(data && typeof data === 'object' && !Array.isArray(data), 'Informe os dados da nota de serviço.');
      F.assert(Array.isArray(s.notes) && Array.isArray(s.titles), 'Dados fiscais e financeiros inválidos.');
      const unit = s.unit;
      F.assert(user.units.includes(unit) && s.units.some(item => item.id === unit) && (!data.unit || data.unit === unit), 'Registre a nota de serviço na unidade atual autorizada.');
      const person = text(data.person), providerDocument = text(data.providerDocument), reference = text(data.reference), series = text(data.series);
      const date = text(data.date), due = text(data.due), description = text(data.description), method = text(data.method), bank = text(data.bank) || 'Conta principal', notes = text(data.notes);
      F.assert(person, 'Informe o prestador do serviço.');
      F.assert(reference, 'Informe o número da nota de serviço.');
      F.assert(description, 'Descreva o serviço prestado.');
      F.assert(dateValid(date) && date <= F.today, 'Informe uma data de emissão válida, até hoje.');
      F.assert(dateValid(due), 'Informe uma data de vencimento válida.');
      F.assert(METHODS.includes(method), 'Selecione uma forma de pagamento válida.');
      const amount = F.round(F.number(data.amount));
      F.assert(amount > 0, 'O valor da nota de serviço deve ser maior que zero.');
      const idempotencyKey = text(data.idempotencyKey || data.idempotency);
      const identity = providerKey({person, providerDocument});
      F.assert(!s.notes.some(note => isService(note) && note.unit === unit && providerKey(note) === identity && normalize(note.reference) === normalize(reference) && normalize(note.series) === normalize(series)), 'Esta nota de serviço já está registrada para o prestador, número e série nesta unidade. Nenhuma nova conta a pagar foi gerada.');
      if (idempotencyKey) F.assert(!s.notes.some(note => isService(note) && note.unit === unit && note.idempotencyKey === idempotencyKey), 'Esta solicitação de nota de serviço já foi registrada. Nenhuma nova conta a pagar foi gerada.');
      const noteId = F.id(s, 'NFS-SERV'), payableId = F.id(s, 'PAG'), createdAt = new Date().toISOString();
      F.assert(!s.notes.some(note => note.id === noteId) && !s.titles.some(title => title.id === payableId), 'O identificador do registro já está em uso.');
      const note = {
        id: noteId, kind: 'Serviço', category: 'service', unit, person, providerDocument,
        reference, series, date, amount, description, due, method, bank, notes,
        status: 'Registrada', payableId, createdAt, createdBy: user.id, createdByName: user.name
      };
      if (idempotencyKey) note.idempotencyKey = idempotencyKey;
      const payable = {
        id: payableId, unit, person, type: 'pagar', status: 'Aberto', amount, date, due,
        method, bank, nf: note.id, source: 'service-note', serviceNoteId: note.id,
        description, installment: '1/1', paid: null, createdAt, createdBy: user.id, createdByName: user.name
      };
      s.notes.unshift(note);
      s.titles.unshift(payable);
      F.log(s, 'Nota de serviço ' + reference + ' registrada para ' + person + '. Conta a pagar ' + payable.id + ' vinculada.');
      return {note: clone(note), payable: clone(payable)};
    });
  }
  function get(s, id) {
    const units = authorizedUnits(s, 'all'), note = s.notes.find(note => note.id === id && isService(note));
    F.assert(note && units.includes(note.unit), 'Nota de serviço não encontrada nas unidades autorizadas.');
    const payable = relatedPayable(s, note);
    return {note: clone(note), payable: payable ? clone(payable) : null};
  }
  function list(s, filters = {}) {
    const units = authorizedUnits(s, filters.unit), from = text(filters.from), to = text(filters.to), status = text(filters.status), q = normalize(filters.q);
    F.assert(!from || dateValid(from), 'Informe uma data inicial válida.');
    F.assert(!to || dateValid(to), 'Informe uma data final válida.');
    F.assert(!from || !to || from <= to, 'A data inicial deve ser anterior ou igual à final.');
    F.assert(!status || ['Aberto', 'Pago'].includes(status), 'Selecione uma situação de conta a pagar válida.');
    return s.notes.filter(note => isService(note) && units.includes(note.unit) && (!from || dateValid(note.date) && note.date >= from) && (!to || dateValid(note.date) && note.date <= to))
      .map(note => {const payable = relatedPayable(s, note); return {...clone(note), payableStatus: payable?.status || null, payable: payable ? clone(payable) : null};})
      .filter(note => (!status || note.payableStatus === status) && (!q || normalize([note.id, note.person, note.providerDocument, note.reference, note.series, note.description, note.notes, note.payableId, note.payable?.nf].join(' ')).includes(q)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id).localeCompare(String(a.id), 'pt-BR', {numeric: true}));
  }
  return {register, list, get};
});
