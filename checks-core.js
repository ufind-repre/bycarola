/* Carteira de cheques: vínculos informativos e histórico preservado. */
(function (root, factory) {
  'use strict';
  const F = root.Fluxo || (typeof require === 'function' ? require('./core.js') : null);
  const api = factory(F);
  root.CarolaChecks = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (F) {
  'use strict';
  if (!F) throw new Error('Carregue core.js antes da carteira de cheques.');
  const STATUSES = Object.freeze(['Em carteira', 'Depositado', 'Compensado', 'Substituído', 'Cancelado', 'Descontado']);
  const PHOTO_LIMIT = 2 * 1024 * 1024;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const text = value => String(value ?? '').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const searchable = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00Z').getTime()) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  function actor(s, action) {
    const user = F.user(s);
    F.assert(user?.active && F.allow(s, 'cheques', action), action === 'view' ? 'Este usuário não tem permissão para consultar cheques.' : 'Este usuário não tem permissão para alterar cheques.');
    return user;
  }
  function allowedUnits(s, selected) {
    const user = actor(s, 'view'), allowed = user.units.filter(id => s.units.some(unit => unit.id === id)), wanted = selected || s.unit;
    F.assert(wanted === 'all' || allowed.includes(wanted), 'A unidade selecionada não está autorizada para este usuário.');
    return wanted === 'all' ? allowed : [wanted];
  }
  function editCheck(s, id) {
    const user = actor(s, 'edit'), check = s.checks.find(c => c.id === id);
    F.assert(check && check.unit === s.unit && user.units.includes(check.unit), 'Cheque não encontrado na unidade atual.');
    return check;
  }
  function photoMetadata(photo) {
    if (typeof photo !== 'string' || !photo) return {present: false, mime: null, bytes: 0};
    const match = photo.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/i);
    return {present: true, mime: match?.[1] || null, bytes: match ? Math.max(0, match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)) : null};
  }
  function validatePhoto(photo) {
    F.assert(typeof photo === 'string', 'A foto deve ser uma imagem JPEG, PNG ou WebP já carregada.');
    const match = photo.match(/^data:image\/(jpeg|png|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/i);
    F.assert(match && match[2].length, 'Selecione uma foto JPEG, PNG ou WebP válida.');
    F.assert(photoMetadata(photo).bytes <= PHOTO_LIMIT, 'A foto do cheque pode ter até 2 MB.');
    return photo;
  }
  function ensureState(s) {
    if (s.checks === undefined) s.checks = [];
    F.assert(Array.isArray(s.checks), 'Carteira de cheques inválida.');
    for (const check of s.checks) {
      check.representativeId = text(check.representativeId) || null;
      if (!own(check, 'representativeName') || check.representativeName === undefined || check.representativeName === '') check.representativeName = check.representativeId ? s.contacts.find(c => c.id === check.representativeId)?.name || null : null;
      check.consignmentId = text(check.consignmentId) || null;
      if (!own(check, 'receivedDate') || !check.receivedDate) check.receivedDate = null;
      if (!own(check, 'createdAt')) check.createdAt = null;
      if (!own(check, 'updatedAt')) check.updatedAt = null;
      if (!own(check, 'photo')) check.photo = '';
      check.history ||= [];
      F.assert(Array.isArray(check.history), 'Histórico do cheque inválido.');
      for (const event of check.history) {
        if (!own(event, 'id')) event.id = null;
        if (!own(event, 'type')) event.type = 'Registro anterior';
        if (!own(event, 'date')) event.date = null;
        if (!own(event, 'at')) event.at = null;
        if (!own(event, 'actorId')) event.actorId = null;
        if (!own(event, 'actorName')) event.actorName = typeof event.actor === 'string' ? event.actor : null;
        if (!own(event, 'changes')) event.changes = [];
        if (!own(event, 'snapshot')) event.snapshot = null;
        if (!own(event, 'legacy')) event.legacy = true;
      }
    }
    return s;
  }
  function snapshot(check) {
    return {id: check.id, unit: check.unit, number: check.number, bank: check.bank, person: check.person, amount: check.amount, due: check.due, status: check.status,
      representativeId: check.representativeId, representativeName: check.representativeName, consignmentId: check.consignmentId,
      receivedDate: check.receivedDate, photo: photoMetadata(check.photo)};
  }
  function appendEvent(s, check, type, note, changes, date = F.today) {
    const user = F.user(s), at = new Date().toISOString();
    const event = {id: F.id(s, 'CH-EVT'), type, status: check.status, date, at, actorId: user.id, actorName: user.name, note: text(note), changes: clone(changes), snapshot: snapshot(check), legacy: false};
    check.history.push(event); check.updatedAt = at;
    return event;
  }
  function get(s, id) {
    const units = allowedUnits(s, 'all'); ensureState(s);
    const check = s.checks.find(c => c.id === id);
    F.assert(check && units.includes(check.unit), 'Cheque não encontrado nas unidades autorizadas.');
    return clone(check);
  }
  function list(s, filters = {}) {
    const units = allowedUnits(s, filters.unit), from = text(filters.from), to = text(filters.to), dateField = filters.dateField || 'due';
    F.assert(['due', 'receivedDate'].includes(dateField), 'Selecione vencimento ou recebimento para filtrar as datas.');
    F.assert(!from || dateValid(from), 'Informe uma data inicial válida.');
    F.assert(!to || dateValid(to), 'Informe uma data final válida.');
    F.assert(!from || !to || from <= to, 'A data inicial deve ser anterior ou igual à final.');
    ensureState(s);
    const q = searchable(filters.q);
    return s.checks.filter(check => {
      const date = check[dateField];
      if (!units.includes(check.unit) || filters.status && check.status !== filters.status || filters.representativeId && check.representativeId !== filters.representativeId) return false;
      if ((from || to) && (!dateValid(date) || from && date < from || to && date > to)) return false;
      const currentRepresentativeName = check.representativeId ? s.contacts.find(contact => contact.id === check.representativeId)?.name : '';
      return !q || searchable([check.id, check.number, check.bank, check.person, check.representativeName, currentRepresentativeName, check.representativeId, check.consignmentId].join(' ')).includes(q);
    }).slice().sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')) || String(a.number).localeCompare(String(b.number), 'pt-BR', {numeric: true})).map(clone);
  }
  function save(s, data, id) {
    return F.atomic(s, () => {
      actor(s, 'edit'); ensureState(s);
      const existing = id ? editCheck(s, id) : null, unit = existing?.unit || s.unit;
      F.assert(!data.unit || data.unit === unit, 'Cadastre ou edite o cheque na unidade atual.');
      const value = (field, fallback = '') => own(data, field) ? data[field] : existing?.[field] ?? fallback;
      const person = text(value('person')), number = text(value('number')), bank = text(value('bank'));
      F.assert(person && number && bank, 'Informe emitente, número do cheque e banco.');
      const amount = F.round(F.number(value('amount'), .01)), due = text(value('due'));
      F.assert(dateValid(due), 'Informe um vencimento válido.');
      let receivedDate;
      if (existing) receivedDate = text(value('receivedDate')) || existing.receivedDate || null;
      else receivedDate = own(data, 'receivedDate') ? text(data.receivedDate) : F.today;
      F.assert(receivedDate === null && existing || dateValid(receivedDate) && receivedDate <= F.today, 'Informe uma data de recebimento válida, até hoje.');
      const representativeId = text(value('representativeId')) || null;
      const representative = representativeId ? s.contacts.find(c => c.id === representativeId && c.type === 'Representante') : null;
      F.assert(!representativeId || representative, 'Selecione um representante válido.');
      const representativeName = representative?.name || null;
      const changedRepresentative = existing && existing.representativeId !== representativeId;
      const consignmentId = own(data, 'consignmentId') ? text(data.consignmentId) || null : changedRepresentative ? null : existing?.consignmentId || null;
      if (consignmentId) {
        const consignment = s.consignments.find(c => c.id === consignmentId);
        F.assert(representativeId && consignment && consignment.rep === representativeId && consignment.unit === unit, 'O romaneio deve pertencer ao representante e à unidade deste cheque.');
      }
      let photo = existing?.photo || '';
      const suppliedPhoto = data.photo;
      // FormData inclui um File de tamanho zero quando nenhum novo arquivo foi escolhido.
      const emptyFile = suppliedPhoto && typeof suppliedPhoto === 'object' && suppliedPhoto.size === 0;
      if (typeof suppliedPhoto === 'string' && suppliedPhoto) photo = validatePhoto(suppliedPhoto);
      else if (suppliedPhoto && !emptyFile) F.assert(false, 'Carregue a foto JPEG, PNG ou WebP antes de salvar o cheque.');
      else if (data.removePhoto === true || data.removePhoto === 'true' || data.removePhoto === 'on') photo = '';
      const now = new Date().toISOString();
      const fields = {person, number, bank, amount, due, receivedDate, representativeId, representativeName, consignmentId, photo};
      const before = existing ? snapshot(existing) : null, check = existing || {id: F.id(s, 'CH'), unit, status: 'Em carteira', createdAt: now, updatedAt: now, history: []};
      const changes = [], labels = {person: 'Emitente', number: 'Número do cheque', bank: 'Banco', amount: 'Valor', due: 'Vencimento', receivedDate: 'Recebimento', consignmentId: 'Romaneio'};
      for (const [field, label] of Object.entries(labels)) if (!existing || check[field] !== fields[field]) changes.push({field, label, before: existing ? check[field] ?? null : null, after: fields[field]});
      if (!existing || check.representativeId !== representativeId || check.representativeName !== representativeName) changes.push({field: 'representative', label: 'Representante que entregou o cheque', before: existing ? {id: check.representativeId, name: check.representativeName} : null, after: representativeId ? {id: representativeId, name: representativeName} : null});
      if ((!existing && photo) || existing && check.photo !== photo) changes.push({field: 'photo', label: 'Foto do cheque', before: before?.photo || photoMetadata(''), after: photoMetadata(photo)});
      Object.assign(check, fields);
      if (!existing) {F.assert(!s.checks.some(c => c.id === check.id), 'O identificador do cheque já está em uso.'); s.checks.unshift(check);}
      if (!existing || changes.length) appendEvent(s, check, existing ? 'Alteração' : 'Cadastro', data.note || (existing ? 'Dados do cheque atualizados.' : 'Cheque cadastrado.'), changes);
      else if (text(data.note)) appendEvent(s, check, 'Comentário', data.note, []);
      // Situação é alterada exclusivamente por setStatus, nunca pelo formulário cadastral.
      F.log(s, (existing ? 'Cheque atualizado: ' : 'Cheque cadastrado: ') + number + '. Vínculo informativo, sem movimentação financeira.');
      return clone(check);
    });
  }
  function setStatus(s, id, data = {}) {
    return F.atomic(s, () => {
      actor(s, 'edit'); ensureState(s);
      const check = editCheck(s, id), status = text(data.status), note = text(data.note), date = text(data.date) || F.today;
      F.assert(STATUSES.includes(status), 'Situação de cheque inválida.');
      F.assert(dateValid(date) && date <= F.today, 'Informe uma data de histórico válida, até hoje.');
      const changed = status !== check.status;
      F.assert(changed || note, 'Altere a situação ou registre uma observação.');
      if (changed && ['Substituído', 'Cancelado', 'Descontado'].includes(status)) F.assert(note, 'Registre uma observação para esta alteração de situação.');
      const before = check.status;
      if (changed) check.status = status;
      appendEvent(s, check, changed ? 'Situação' : 'Comentário', note, changed ? [{field: 'status', label: 'Situação', before, after: status}] : [], date);
      F.log(s, 'Cheque ' + check.number + ': ' + (changed ? status : 'observação registrada') + '.');
      return clone(check);
    });
  }
  return {STATUSES, ensureState, list, get, save, setStatus};
});
