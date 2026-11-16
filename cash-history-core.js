/* Fechamentos de caixa preservados por sessão, sem dependências de interface. */
(function (root, factory) {
  'use strict';
  const F = root.Fluxo || (typeof require === 'function' ? require('./core.js') : null);
  const api = factory(F);
  root.CarolaCashHistory = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (F) {
  'use strict';
  if (!F) throw new Error('Carregue core.js antes do histórico de caixas.');
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value ?? '').trim();
  const own = (object, name) => Object.prototype.hasOwnProperty.call(object, name);
  const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00Z').getTime()) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  const atValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(new Date(value).getTime());
  const explicitNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const explicitMoney = value => {const n = explicitNumber(value); return n === null ? null : F.round(n);};
  function actor(s) {
    const u = F.user(s);
    F.assert(u?.active, 'Selecione um usuário ativo.');
    return u;
  }
  function permit(s, action) {
    const u = actor(s);
    F.assert(F.allow(s, 'caixa', action), action === 'view' ? 'Este usuário não tem permissão para consultar os caixas.' : 'Este usuário não tem permissão para operar os caixas.');
    return u;
  }
  function authorizedUnits(s, selected) {
    const u = permit(s, 'view');
    const allowed = u.units.filter(id => s.units.some(unit => unit.id === id));
    const wanted = selected || s.unit;
    F.assert(wanted === 'all' || allowed.includes(wanted), 'A unidade selecionada não está autorizada para este usuário.');
    return wanted === 'all' ? allowed : [wanted];
  }
  function operator(s, cashId) {
    const u = permit(s, 'edit');
    const cash = s.cash.find(c => c.id === cashId);
    F.assert(cash && cash.unit === s.unit && u.units.includes(cash.unit), 'Selecione um caixa da unidade atual.');
    F.assert(Array.isArray(cash.users) && cash.users.includes(u.id), 'Você não está autorizado a operar este caixa.');
    return {cash, user: u};
  }
  function makeId(s) {
    let id;
    do {id = F.id(s, 'CX-FECH');} while (s.cashClosings.some(c => c.id === id));
    return id;
  }
  function legacySnapshot(s, cash, event, index) {
    const date = dateValid(event.date) ? event.date : atValid(event.closedAt) ? event.closedAt.slice(0, 10) : null;
    const closedBy = event.closedBy || event.userId || event.actorId || null;
    const closedByName = event.closedByName || event.userName || event.actorName || (closedBy ? s.users.find(u => u.id === closedBy)?.name : null) || null;
    const cashName = text(event.cashName) || cash.name || null;
    const snapshot = {
      id: event.closingId || makeId(s), cashId: cash.id, cashName, unit: event.unit || cash.unit,
      unitName: event.unitName || s.units.find(u => u.id === (event.unit || cash.unit))?.name || null,
      session: text(event.session) || null,
      openedDate: dateValid(event.openedDate) ? event.openedDate : null,
      closedDate: date, closedAt: atValid(event.closedAt) ? event.closedAt : null,
      closedBy, closedByName,
      opening: explicitMoney(event.opening), expected: explicitMoney(event.expected),
      counted: explicitMoney(own(event, 'counted') ? event.counted : event.amount),
      difference: explicitMoney(event.difference),
      salesTotal: explicitMoney(event.salesTotal), netSalesTotal: explicitMoney(event.netSalesTotal), salesCount: explicitNumber(event.salesCount),
      byMethod: Array.isArray(event.byMethod) ? clone(event.byMethod) : null,
      movements: Array.isArray(event.movements) ? clone(event.movements) : null,
      sales: Array.isArray(event.sales) ? clone(event.sales) : null,
      note: event.note === undefined ? '' : String(event.note),
      legacy: true, nameSource: event.cashName ? 'historical' : 'current',
      legacySource: {cashId: cash.id, historyIndex: index},
      sourceDate: event.date === undefined ? null : String(event.date)
    };
    // Nunca usamos o saldo ou a sessão atuais para preencher um fechamento antigo.
    return snapshot;
  }
  function ensureState(s) {
    F.assert(s && Array.isArray(s.cash), 'Dados de caixas inválidos.');
    if (s.cashClosings === undefined) s.cashClosings = [];
    F.assert(Array.isArray(s.cashClosings), 'Histórico de fechamentos inválido.');
    for (const cash of s.cash) {
      cash.history ||= [];
      F.assert(Array.isArray(cash.history), 'Histórico do caixa inválido.');
      cash.history.forEach((event, index) => {
        if (event.type !== 'Fechamento') return;
        const existing = s.cashClosings.find(c => (event.closingId && c.id === event.closingId) || (c.legacySource?.cashId === cash.id && c.legacySource?.historyIndex === index));
        if (existing) {event.closingId = existing.id; return;}
        let snapshot;
        if (event.snapshot && event.snapshot.id && event.snapshot.cashId === cash.id && event.snapshot.unit === cash.unit) {
          snapshot = clone(event.snapshot);
          F.assert(!s.cashClosings.some(c => c.id === snapshot.id), 'Identificador de fechamento duplicado.');
        } else snapshot = legacySnapshot(s, cash, event, index);
        s.cashClosings.push(snapshot);
        event.closingId = snapshot.id;
      });
    }
    return s;
  }
  function received(order) {
    if (!order.creditApplied) return F.round(F.number(order.total));
    const value = typeof order.paidDifference === 'number' && Number.isFinite(order.paidDifference) ? order.paidDifference : Number(order.total) - Number(order.creditApplied);
    return F.round(F.number(Math.max(0, value)));
  }
  function snapshotSales(s, cash) {
    return s.orders.filter(o => o.cashId === cash.id && o.cashSession === cash.session && !['Orçamento', 'Consignado', 'Cancelado'].includes(o.status)).map(order => {
      const returns = s.returns.filter(r => r.orderId === order.id);
      const returnedTotal = F.round(returns.reduce((n, r) => n + Number(r.amount || 0), 0));
      return {
        id: order.id, unit: order.unit, storeId: order.storeId || null, date: order.date,
        client: order.client || 'Consumidor', clientCity: order.clientCity || '', clientState: order.clientState || '',
        sellerId: order.sellerId || null, seller: order.seller || null, channel: order.channel || null,
        status: order.status, billingStatus: order.billingStatus || null,
        method: order.method || 'Não informado', total: F.round(F.number(order.total)),
        received: received(order), creditApplied: F.round(F.number(order.creditApplied || 0)),
        returnedTotal, netTotal: F.round(Math.max(0, Number(order.total) - returnedTotal)),
        discount: F.round(F.number(order.discount || 0)), installments: Number(order.installments || 1),
        items: order.items.map(item => {
          const product = s.products.find(p => p.id === item.product);
          return {product: item.product, name: product?.name || item.product, ref: product?.ref || null, color: product?.color || null, size: product?.size || null, qty: Number(item.qty), returned: Number(item.returned || 0), price: Number(item.price)};
        }),
        returns: clone(returns), cashId: cash.id, cashSession: cash.session
      };
    });
  }
  function close(s, cashId, data = {}) {
    return F.atomic(s, () => {
      ensureState(s);
      const {cash, user} = operator(s, cashId);
      F.assert(cash.open, 'Este caixa já está fechado.');
      F.assert(text(cash.session), 'A sessão atual do caixa não foi identificada.');
      F.assert(!s.cashClosings.some(c => c.cashId === cash.id && c.session === cash.session), 'Esta sessão do caixa já foi fechada.');
      const counted = F.round(F.number(data.counted)), expected = F.round(Number(F.cashExpected(s, cash.id)));
      F.assert(Number.isFinite(expected), 'O valor esperado do caixa é inválido.');
      const difference = F.round(counted - expected), note = text(data.note);
      if (difference) F.assert(note, 'Informe uma observação para justificar a diferença de caixa.');
      const sales = snapshotSales(s, cash), byMethod = [];
      for (const sale of sales) {
        let method = byMethod.find(m => m.method === sale.method);
        if (!method) {method = {method: sale.method, count: 0, total: 0, received: 0, creditApplied: 0, returnedTotal: 0, netTotal: 0}; byMethod.push(method);}
        method.count++;
        for (const field of ['total', 'received', 'creditApplied', 'returnedTotal', 'netTotal']) method[field] = F.round(method[field] + sale[field]);
      }
      const movements = s.cashMoves.filter(m => m.cashId === cash.id && m.session === cash.session).map(clone);
      const now = new Date().toISOString();
      const snapshot = {
        id: makeId(s), cashId: cash.id, cashName: cash.name, unit: cash.unit,
        unitName: s.units.find(u => u.id === cash.unit)?.name || cash.unit,
        session: cash.session, openedDate: cash.opened || null, openedAt: cash.openedAt || null,
        closedDate: F.today, closedAt: now, closedBy: user.id, closedByName: user.name,
        opening: F.round(F.number(cash.opening)), expected, counted, difference,
        salesTotal: F.round(sales.reduce((n, sale) => n + sale.total, 0)),
        netSalesTotal: F.round(sales.reduce((n, sale) => n + sale.netTotal, 0)), salesCount: sales.length,
        byMethod, sales, movements, note, legacy: false
      };
      s.cashClosings.push(snapshot);
      Object.assign(cash, {open: false, counted, difference, closedDate: snapshot.closedDate, closedAt: now, closedBy: user.id, lastClosingId: snapshot.id});
      cash.history.push({date: F.today, type: 'Fechamento', amount: counted, note, closingId: snapshot.id, session: cash.session, closedAt: now, closedBy: user.id, closedByName: user.name, snapshot: clone(snapshot)});
      F.log(s, 'Caixa ' + cash.name + ' fechado. Registro ' + snapshot.id + '.');
      return clone(snapshot);
    });
  }
  function open(s, cashId, data = {}) {
    return F.atomic(s, () => {
      ensureState(s);
      const {cash, user} = operator(s, cashId);
      F.assert(!cash.open, 'Este caixa já está aberto.');
      const opening = F.round(F.number(data.opening)), now = new Date().toISOString(), session = F.id(s, 'SESSAO');
      Object.assign(cash, {open: true, opening, opened: F.today, openedAt: now, openedBy: user.id, session, counted: null, difference: null, closedDate: null, closedAt: null, closedBy: null});
      cash.history.push({date: F.today, at: now, type: 'Abertura', amount: opening, session, openedBy: user.id, openedByName: user.name});
      F.log(s, 'Nova sessão aberta no caixa ' + cash.name + '.');
      return clone(cash);
    });
  }
  function list(s, filters = {}) {
    const units = authorizedUnits(s, filters.unit);
    const from = text(filters.from), to = text(filters.to);
    F.assert(!from || dateValid(from), 'Informe uma data inicial válida.');
    F.assert(!to || dateValid(to), 'Informe uma data final válida.');
    F.assert(!from || !to || from <= to, 'A data inicial deve ser anterior ou igual à final.');
    ensureState(s);
    return s.cashClosings.filter(closing => units.includes(closing.unit) && (!filters.cashId || closing.cashId === filters.cashId) && (!from || closing.closedDate && closing.closedDate >= from) && (!to || closing.closedDate && closing.closedDate <= to))
      .slice().sort((a, b) => String(b.closedDate || '').localeCompare(String(a.closedDate || '')) || String(b.closedAt || '').localeCompare(String(a.closedAt || '')) || Number(b.legacySource?.historyIndex || 0) - Number(a.legacySource?.historyIndex || 0) || String(b.id).localeCompare(String(a.id), 'pt-BR', {numeric: true})).map(clone);
  }
  function get(s, closingId) {
    const units = authorizedUnits(s, 'all');
    ensureState(s);
    const snapshot = s.cashClosings.find(c => c.id === closingId);
    F.assert(snapshot && units.includes(snapshot.unit), 'Fechamento não encontrado nas unidades autorizadas.');
    return clone(snapshot);
  }
  return {ensureState, close, open, list, get};
});
