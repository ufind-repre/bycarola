/* Fluxo Moda · regras compartilhadas do protótipo integrado. */
(function (root, factory) {
  'use strict';
  const F = root.Fluxo || (typeof require === 'function' ? require('./core.js') : null);
  const api = factory(F);
  root.CarolaDomain = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (F) {
  'use strict';
  if (!F) throw new Error('Carregue core.js antes das regras de integração.');
  if (!F.modules.includes('lojas')) F.modules.push('lojas');
  const original = F.__integrationOriginal || {
    sell: F.sell, invoiceBudget: F.invoiceBudget, issueNote: F.issueNote,
    newConsignment: F.newConsignment, settleConsignment: F.settleConsignment, returnSale: F.returnSale
  };
  F.__integrationOriginal = original;
  const copy = x => JSON.parse(JSON.stringify(x));
  const text = x => String(x ?? '').trim();
  const dateOnly = x => String(x || '').slice(0, 10);
  const dateValid = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(new Date(x + 'T12:00:00').getTime()) && new Date(x + 'T12:00:00').toISOString().slice(0, 10) === x;
  const assert = F.assert;
  const round = F.round;
  const user = s => F.user(s);
  const today = () => F.today;
  const stamp = () => new Date().toISOString();
  const transaction = (s, fn) => F.atomic(s, fn);
  const ORDER_STATUSES = ['Orçamento', 'Faturamento', 'Pedido faturado', 'Consignado', 'Devolução de produtos', 'Em separação', 'Enviado', 'Entregue'];
  const shipment = ['Em separação', 'Enviado', 'Entregue'];

  function ensure(s) {
    s.integration ||= {};
    s.integration.productionIds ||= [];
    s.integration.materialEntryIds ||= [];
    s.integration.productionImports ||= [];
    s.stores ||= [];
    s.targetHistory ||= [];
    s.customers ||= [];
    s.targets ||= {};
    return s;
  }
  function authorizedUnits(s, selected) {
    const allowed = (user(s)?.active ? user(s).units : []).filter(id => s.units.some(u => u.id === id));
    const wanted = selected || s.unit;
    assert(wanted === 'all' || allowed.includes(wanted), 'Esta unidade não está autorizada para o usuário.');
    assert(allowed.length, 'Nenhuma unidade autorizada.');
    return wanted === 'all' ? allowed : [wanted];
  }
  function period(s, data = {}) {
    const from = data.from || s.floor, to = data.to || today();
    assert(dateValid(from) && dateValid(to), 'Informe datas válidas para o período.');
    assert(from >= s.floor && to <= today() && from <= to, 'O período deve começar em ou após ' + s.floor + ', terminar até hoje e ter início anterior ao fim.');
    return {from, to};
  }
  function history(s, o, status, description) {
    o.statusHistory ||= [];
    o.statusHistory.push({date: today(), at: stamp(), status, actor: user(s)?.name || 'Equipe', text: description || status});
  }
  function validProduct(s, id) {
    const p = s.products.find(p => p.id === id);
    assert(p?.active && p.kind === 'acabado', 'Produto acabado indisponível.');
    return p;
  }
  function activeNote(s, id) { return s.notes.find(n => n.orderId === id && n.status !== 'Cancelada' && n.kind !== 'Entrada'); }

  function migrate(s) {
    ensure(s);
    s.products.filter(p => p.sourceVariantKey).forEach(p => {p.pricePending = !(Number(p.price) > 0);});
    for (const u of s.users) {
      u.hr ||= {employee: true, birthDate: '', goal: 0, accessNotes: ''};
      u.hr.goal = Number(u.hr.goal) || 0;
      if (!u.permissions.lojas) {
        const admin = u.role === 'Administrador';
        u.permissions.lojas = {view: admin, edit: admin, export: admin};
      }
    }
    if (s.integration.version !== 1) {
      const cities = {fab: ['Maringá', 'PR'], mar: ['Maringá', 'PR'], cia: ['Cianorte', 'PR']};
      s.units.forEach(unit => {
        if (s.stores.some(x => x.unit === unit.id)) return;
        const manager = s.users.find(u => u.active && u.units.includes(unit.id) && (u.role === 'Administrador' || /geren/i.test(u.role))) || s.users.find(u => u.active && u.units.includes(unit.id));
        const seller = s.users.find(u => u.active && u.units.includes(unit.id) && /vendedor|caixa|geren/i.test(u.role)) || manager;
        const [city, state] = cities[unit.id] || ['', 'PR'];
        s.stores.push({id: 'store-' + unit.id, unit: unit.id, name: unit.id === 'fab' ? 'By Carola · Fábrica' : unit.name, city, state, address: '', active: true,
          access: [{userId: manager?.id, role: 'Gerente', login: 'gerente', password: 'gerente123'}, {userId: seller?.id, role: 'Vendedor', login: 'vendedor', password: 'vendedor123'}]});
      });
      const birthdays = ['1990-10-12', '1994-10-29', '1992-03-07', '1988-10-22', '1991-07-14'];
      s.users.forEach((u, i) => {if (!u.hr.birthDate) u.hr.birthDate = birthdays[i % birthdays.length];});
      for (const o of s.orders) {
        if (o.status === 'Faturado') o.status = activeNote(s, o.id) ? 'Pedido faturado' : 'Faturamento';
        if (o.status === 'Devolvido') o.status = 'Devolução de produtos';
        o.stockPosted = o.status !== 'Orçamento' && o.status !== 'Consignado';
        o.billingStatus ||= activeNote(s, o.id) ? 'Pedido faturado' : o.stockPosted ? 'Faturamento' : 'Orçamento';
        o.statusHistory ||= [{date: o.date, at: o.date + 'T12:00:00', status: o.status, actor: o.seller || 'Equipe', text: 'Registro anterior preservado na integração.'}];
        const store = s.stores.find(st => st.unit === o.unit);
        o.storeId ||= store?.id;
        o.clientCity ||= store?.city || '';
        o.clientState ||= store?.state || '';
      }
      s.contacts.filter(c => c.type === 'Cliente').forEach(c => {
        c.city ||= 'Maringá'; c.state ||= 'PR';
        if (!s.customers.some(x => x.name === c.name)) s.customers.push({id: c.id, name: c.name, city: c.city, state: c.state, email: c.email || '', phone: c.phone || ''});
      });
      for (const rom of s.consignments) {
        rom.ledger ||= [{id: F.id(s, 'ROM-REG'), at: stamp(), date: rom.date, type: 'Abertura', actor: 'Migração da demonstração', reason: 'Remessa original preservada.', additions: rom.items.map(i => ({product: i.product, qty: i.qty})), returns: []}];
      }
      s.integration.version = 1;
      // Um pedido online visível permite percorrer separação, envio e entrega.
      if (!s.orders.some(o => o.channel === 'E-commerce')) {
        const p = s.products.find(p => p.kind === 'acabado' && p.active && p.published && F.at(s, p.id, 'fab') > 0);
        if (p) {
          const o = sell(s, {unit: 'fab', client: 'Cliente online · demonstração', items: [{product: p.id, qty: 1}], channel: 'E-commerce', method: 'Pix'});
          Object.assign(o, {clientCity: 'Curitiba', clientState: 'PR', storeId: 'store-fab', trackingCode: '', address: 'Endereço de entrega da demonstração'});
          issueNote(s, o.id);
        }
      }
    }
    return s;
  }

  function sell(s, data) {
    return transaction(s, () => {
      (data.items || []).forEach(i => assert(validProduct(s, i.product).price > 0, 'Defina o preço de venda do produto no Estoque antes de vendê-lo.'));
      const o = original.sell(s, data);
      o.stockPosted = true;
      o.billingStatus = 'Faturamento';
      o.status = data.channel === 'E-commerce' ? 'Em separação' : 'Faturamento';
      if (data.channel === 'E-commerce') {o.fulfillmentStage = 'Em separação'; o.seller = 'Loja online'; o.sellerId = '';}
      o.storeId = data.storeId || s.stores?.find(st => st.unit === o.unit)?.id || null;
      o.clientCity = text(data.clientCity);
      o.clientState = text(data.clientState).toUpperCase();
      history(s, o, o.status, 'Venda registrada. Estoque baixado uma única vez; documento disponível para emissão de nota.');
      return o;
    });
  }
  function invoiceBudget(s, id) {
    return transaction(s, () => {
      const o = s.orders.find(o => o.id === id);
      assert(o && !o.stockPosted && o.status === 'Orçamento', 'Este orçamento já foi faturado.');
      original.invoiceBudget(s, id);
      o.stockPosted = true; o.status = 'Faturamento'; o.billingStatus = 'Faturamento';
      history(s, o, o.status, 'Orçamento aprovado para faturamento; estoque e recebível registrados.');
      return o;
    });
  }
  function issueNote(s, id) {
    return transaction(s, () => {
      const o = s.orders.find(o => o.id === id);
      assert(o && o.stockPosted && o.status !== 'Orçamento' && o.status !== 'Consignado', 'Envie o pedido para faturamento antes de emitir a nota.');
      assert(!activeNote(s, id), 'O pedido já possui uma nota ativa.');
      const visible = o.status;
      o.status = 'Faturado'; // Compatibilidade com a regra fiscal original.
      const note = original.issueNote(s, id);
      o.billingStatus = 'Pedido faturado';
      o.status = o.channel === 'E-commerce' ? o.fulfillmentStage || 'Em separação' : visible === 'Devolução de produtos' ? visible : 'Pedido faturado';
      history(s, o, 'Pedido faturado', 'Nota demonstrativa ' + note.id + ' emitida e vinculada ao financeiro.');
      return note;
    });
  }
  function returnSale(s, orderId, productId, n, reason) {
    return transaction(s, () => {
      const o = s.orders.find(o => o.id === orderId);
      assert(o?.stockPosted, 'A venda precisa estar faturada para registrar devolução.');
      const r = original.returnSale(s, orderId, productId, n, reason);
      o.status = 'Devolução de produtos';
      history(s, o, o.status, n + ' peça(s) devolvida(s): ' + reason);
      return r;
    });
  }
  function cashExpected(s, cashId) {
    const cash = s.cash.find(c => c.id === cashId);
    assert(cash, 'Caixa não encontrado.');
    const cashSales = s.orders.filter(o => o.cashId === cashId && o.cashSession === cash.session && o.status !== 'Orçamento' && o.method === 'Dinheiro');
    const received = cashSales.reduce((sum, o) => {
      if (!o.creditApplied) return sum + o.total;
      const difference = typeof o.paidDifference === 'number' && Number.isFinite(o.paidDifference) ? o.paidDifference : o.total - Number(o.creditApplied || 0);
      return sum + Math.max(0, difference);
    }, 0);
    const adjustments = s.cashMoves.filter(m => m.cashId === cashId && m.session === cash.session).reduce((sum, m) => sum + (m.type === 'Sangria' ? -m.amount : m.amount), 0);
    return round(cash.opening + received + adjustments);
  }
  function setOrderStatus(s, id, status, extra = {}) {
    return transaction(s, () => {
      assert(ORDER_STATUSES.includes(status), 'Situação de pedido inválida.');
      const o = s.orders.find(o => o.id === id);
      assert(o, 'Pedido não encontrado.');
      if (status === 'Faturamento') {
        if (o.status === 'Orçamento') return invoiceBudget(s, id);
        assert(o.stockPosted && !activeNote(s, id), 'O pedido já possui nota emitida.');
        o.billingStatus = 'Faturamento';
        if (o.channel !== 'E-commerce') o.status = status;
      } else if (status === 'Pedido faturado') {
        issueNote(s, id);
      } else if (shipment.includes(status)) {
        assert(o.channel === 'E-commerce' && o.stockPosted, 'Estas etapas pertencem às vendas online.');
        assert(o.items.some(i => i.qty > Number(i.returned || 0)), 'Este pedido foi integralmente devolvido e não possui peças disponíveis para envio ou entrega.');
        const before = o.fulfillmentStage || 'Em separação';
        const current = shipment.indexOf(before), next = shipment.indexOf(status);
        assert(next === current || next === current + 1, 'Avance uma etapa de entrega por vez.');
        if (status === 'Enviado') assert(activeNote(s, id), 'Emita a nota do pedido antes do envio.');
        o.fulfillmentStage = status; o.status = status;
        if (status === 'Enviado') {o.shippedAt ||= stamp(); o.trackingCode = text(extra.trackingCode) || o.trackingCode || 'CAROLA-' + o.id;}
        if (status === 'Entregue') o.deliveredAt ||= stamp();
      } else if (status === 'Orçamento') {
        assert(!o.stockPosted && o.status === 'Orçamento', 'Uma venda que movimentou estoque não pode voltar a orçamento.');
      } else if (status === 'Consignado') {
        assert(!o.stockPosted && o.romId, 'Use um romaneio para registrar peças em consignação.');
        o.status = status;
      } else if (status === 'Devolução de produtos') {
        assert(s.returns.some(r => r.orderId === id), 'Registre os produtos e quantidades devolvidos antes de alterar esta situação.');
        o.status = status;
      }
      if (status !== 'Pedido faturado') history(s, o, status);
      return o;
    });
  }

  function newConsignment(s, data) {
    return transaction(s, () => {
      const rom = original.newConsignment(s, data);
      rom.ledger = [{id: F.id(s, 'ROM-REG'), at: stamp(), date: today(), type: 'Abertura', actor: user(s)?.name, reason: text(data.reason) || 'Remessa inicial.', additions: copy(rom.items.map(x => ({product: x.product, qty: x.qty}))), returns: []}];
      return rom;
    });
  }
  function settleConsignment(s, id, lines) {
    return transaction(s, () => {
      const rom = s.consignments.find(r => r.id === id);
      assert(rom, 'Romaneio não encontrado.');
      const r = original.settleConsignment(s, id, lines);
      if (r.order) {r.order.stockPosted = true; r.order.status = 'Faturamento'; r.order.billingStatus = 'Faturamento'; history(s, r.order, 'Faturamento', 'Acerto de consignação ' + id);}
      rom.ledger ||= [];
      rom.ledger.push({id: F.id(s, 'ROM-REG'), at: stamp(), date: today(), type: 'Acerto', actor: user(s)?.name, reason: 'Acerto comercial.', lines: rom.items.map((i, n) => ({product: i.product, sold: Number(lines[n]?.sold || 0), returned: Number(lines[n]?.returned || 0)})), gross: r.gross, commission: r.commission, net: r.net, order: r.order?.id || null});
      return r;
    });
  }
  function updateConsignment(s, id, data = {}) {
    return transaction(s, () => {
      const rom = s.consignments.find(r => r.id === id);
      assert(rom, 'Romaneio não encontrado.');
      assert(text(data.reason), 'Informe o motivo da alteração para o histórico.');
      const additions = (data.additions || []).filter(x => Number(x.qty) !== 0).map(x => ({product: x.product, qty: F.qty(x.qty, 1)}));
      const returns = (data.returns || []).filter(x => Number(x.qty) !== 0).map(x => ({product: x.product, qty: Number(x.qty)}));
      assert(additions.length || returns.length, 'Informe uma adição de peças ou alteração de devolução.');
      for (const x of additions) {
        const p = validProduct(s, x.product);
        F.transfer(s, p.id, rom.from, rom.loc, x.qty, 'Adição ao romaneio', rom.id);
        const item = rom.items.find(i => i.product === p.id);
        if (item) item.qty += x.qty;
        else rom.items.push({product: p.id, qty: x.qty, sold: 0, returned: 0, price: F.priceAt(s, p.id).price});
      }
      for (const x of returns) {
        assert(Number.isInteger(x.qty), 'A alteração da devolução deve usar quantidades inteiras.');
        const item = rom.items.find(i => i.product === x.product);
        assert(item, 'Produto da devolução não consta neste romaneio.');
        assert(item.returned + x.qty >= 0, 'O estorno excede a quantidade devolvida anteriormente.');
        assert(item.sold + item.returned + x.qty <= item.qty, 'A devolução excede o saldo em posse do representante.');
        if (x.qty > 0) F.transfer(s, x.product, rom.loc, rom.from, x.qty, 'Devolução ajustada do consignado', rom.id);
        else F.transfer(s, x.product, rom.from, rom.loc, -x.qty, 'Estorno de devolução do consignado', rom.id);
        item.returned += x.qty;
      }
      rom.status = rom.items.every(x => x.qty === x.sold + x.returned) ? 'Fechado' : rom.items.some(x => x.sold || x.returned) ? 'Parcialmente acertado' : 'Em aberto';
      const entry = {id: F.id(s, 'ROM-REG'), at: stamp(), date: today(), type: 'Alteração de peças', actor: user(s)?.name || 'Equipe', reason: text(data.reason), additions: copy(additions), returns: copy(returns)};
      rom.ledger ||= []; rom.ledger.push(entry);
      rom.history.push({date: today(), gross: 0, commission: 0, net: 0, text: entry.reason, type: entry.type, ledgerId: entry.id});
      F.log(s, rom.id + ' atualizado: ' + entry.reason);
      return rom;
    });
  }

  function upsertStore(s, data, id) {
    return transaction(s, () => {
      ensure(s);
      assert(text(data.name), 'Informe o nome da loja.');
      assert(!data.state || /^[A-Za-z]{2}$/.test(data.state), 'Informe a UF com duas letras.');
      let store = s.stores.find(x => x.id === id);
      let unit = store?.unit || text(data.unit);
      if (unit) assert(s.units.some(x => x.id === unit), 'Unidade não encontrada.');
      if (!unit) {
        unit = F.id(s, 'loja').toLowerCase();
        s.units.push({id: unit, name: text(data.name), production: false});
        s.locations.push({id: unit, unit, type: 'acabado', name: text(data.name)});
      }
      assert(!s.stores.some(x => x.id !== id && x.unit === unit), 'Esta unidade já possui uma loja cadastrada.');
      let access;
      if (Array.isArray(data.access)) access = data.access.map(a => ({userId: a.userId, role: a.role, login: text(a.login), password: text(a.password)}));
      else {
        access = ['manager', 'seller'].map((prefix, i) => ({userId: data[prefix + 'Id'], role: i ? 'Vendedor' : 'Gerente', login: text(data[prefix + 'Login']), password: text(data[prefix + 'Password'])}));
        if (store) access = access.map((a, i) => ({...a, userId: a.userId || store.access[i]?.userId, login: a.login || store.access[i]?.login, password: a.password || store.access[i]?.password}));
      }
      assert(access.length >= 2 && access.some(a => a.role === 'Gerente') && access.some(a => a.role === 'Vendedor'), 'Cadastre os acessos de gerente e vendedor.');
      assert(new Set(access.map(a => a.login.toLowerCase())).size === access.length, 'Use logins diferentes para gerente e vendedor.');
      access.forEach(a => {
        const u = s.users.find(u => u.id === a.userId && u.active);
        assert(u, 'Selecione um usuário ativo para cada acesso.');
        assert(a.login && a.password.length >= 4, 'Informe login e senha com pelo menos quatro caracteres.');
        assert(['Gerente', 'Vendedor'].includes(a.role), 'Perfil de acesso inválido.');
        if (!u.units.includes(unit)) u.units.push(unit);
        for (const m of ['inicio', 'pdv', 'pedidos', 'caixa']) u.permissions[m] ||= {view: true, edit: true, export: true};
        // Os acessos específicos da loja liberam seus fluxos no ambiente PDV.
        u.permissions.pdv = {view: true, edit: true, export: true};
      });
      const v = {unit, name: text(data.name), city: text(data.city), state: text(data.state).toUpperCase(), address: text(data.address), active: data.active !== false && data.active !== 'false', access};
      if (store) Object.assign(store, v);
      else {store = {id: F.id(s, 'STORE'), ...v}; s.stores.push(store);}
      if (!user(s).units.includes(unit)) user(s).units.push(unit);
      if (!s.cash.some(c => c.unit === unit)) s.cash.push({id: F.id(s, 'CX'), unit, name: 'Caixa · ' + store.name, users: [...new Set(access.map(a => a.userId))], open: true, opening: 0, opened: today(), session: F.id(s, 'SESSAO'), counted: null, history: []});
      else s.cash.filter(c => c.unit === unit).forEach(c => {c.users = [...new Set([...c.users, ...access.map(a => a.userId)])];});
      F.log(s, 'Cadastro da loja ' + store.name + ' atualizado.');
      return store;
    });
  }
  function authenticateStore(s, storeId, login, password) {
    const st = s.stores.find(x => x.id === storeId && x.active);
    assert(st, 'Selecione uma loja ativa.');
    const access = st.access.find(a => a.login.toLowerCase() === text(login).toLowerCase() && a.password === String(password));
    const u = access && s.users.find(u => u.id === access.userId && u.active && u.units.includes(st.unit));
    assert(u, 'Login ou senha de acesso da loja inválidos.');
    return {storeId: st.id, unit: st.unit, userId: u.id, role: access.role, name: u.name, login: access.login};
  }
  function checkout(s, data) {
    return transaction(s, () => {
      ensure(s);
      const session = data.session;
      const st = s.stores.find(x => x.id === (data.storeId || session?.storeId)) || s.stores.find(x => x.unit === data.unit);
      const unit = st?.unit || data.unit || s.unit;
      const isOnline = data.channel === 'E-commerce';
      let seller = user(s);
      if (!isOnline) {
        assert(st?.active && session?.storeId === st.id && session.unit === unit, 'Entre no PDV da loja antes de concluir a venda.');
        const access = st.access.find(a => a.userId === session.userId && a.role === session.role && a.login === session.login);
        seller = access && s.users.find(u => u.id === session.userId && u.active && u.units.includes(unit));
        assert(seller, 'O acesso da loja mudou. Entre novamente no PDV.');
      } else authorizedUnits(s, unit);
      const installments = Number(data.installments || 1);
      assert(Number.isInteger(installments) && installments >= 1 && installments <= 24, 'Use de uma a 24 parcelas.');
      if (!['Cartão', 'Boleto', 'Cartão de crédito'].includes(data.method)) assert(installments === 1, 'Este meio de pagamento não permite parcelamento.');
      const gross = (data.items || []).reduce((n, i) => n + validProduct(s, i.product).price * F.qty(i.qty, 1), 0);
      const discount = F.number(data.discount || 0, 0, gross);
      if (!isOnline && session.role !== 'Gerente' && discount > gross * 0.15) assert(false, 'Desconto acima de 15% exige acesso de gerente.');
      let cash;
      if (!isOnline) {
        cash = s.cash.find(c => c.unit === unit && c.open && c.users.includes(seller.id) && (!data.cashId || c.id === data.cashId));
        assert(cash, 'Abra um caixa autorizado para este vendedor na loja selecionada.');
      }
      const originalUser = s.user, originalUnit = s.unit;
      let order;
      try {
        s.user = seller.id; s.unit = unit;
        order = sell(s, {...data, unit, storeId: st?.id, cashId: cash?.id || null, cashSession: cash?.session || null});
        order.sellerId = isOnline ? '' : seller.id;
        order.seller = isOnline ? 'Loja online' : seller.name;
        if (session?.role === 'Gerente' && data.seller) {
          const chosen = s.users.find(u => u.active && u.units.includes(unit) && (u.id === data.seller || u.name === data.seller));
          if (chosen) {order.sellerId = chosen.id; order.seller = chosen.name;}
        }
      } finally {s.user = originalUser; s.unit = originalUnit;}
      order.client = text(data.client) || 'Consumidor';
      order.clientCity = text(data.clientCity || st?.city);
      order.clientState = text(data.clientState || st?.state).toUpperCase();
      order.installments = installments;
      order.address = text(data.address);
      order.shippingAddress = typeof data.shippingAddress === 'object' && data.shippingAddress ? copy(data.shippingAddress) : text(data.shippingAddress || data.address);
      order.customerEmail = text(data.email);
      if (order.client !== 'Consumidor') {
        let customer = s.customers.find(c => c.name.toLowerCase() === order.client.toLowerCase() && c.city === order.clientCity && c.state === order.clientState);
        if (!customer) {customer = {id: F.id(s, 'CLI'), name: order.client, city: order.clientCity, state: order.clientState, email: order.customerEmail}; s.customers.push(customer);}
        order.customerId = customer.id;
      }
      if (installments > 1) {
        const titles = s.titles.filter(t => t.orderId === order.id && t.type === 'receber');
        assert(titles.length === 1, 'Os recebíveis desta venda já foram gerados.');
        const base = titles[0], unitAmount = Math.floor(order.total * 100 / installments) / 100;
        s.titles = s.titles.filter(t => t.id !== base.id);
        for (let i = 1; i <= installments; i++) s.titles.unshift({...base, id: F.id(s, 'REC'), amount: i === installments ? round(order.total - unitAmount * (installments - 1)) : unitAmount, installment: i + '/' + installments, due: F.offset(i * 30), status: 'Aberto', paid: null});
      }
      return order;
    });
  }

  function sales(s, filters = {}) {
    const {from, to} = period(s, filters), units = authorizedUnits(s, filters.unit);
    const orders = s.orders.filter(o => units.includes(o.unit) && o.date >= from && o.date <= to && !['Orçamento', 'Consignado', 'Cancelado'].includes(o.status));
    const returns = s.returns.filter(r => units.includes(r.unit) && r.date >= from && r.date <= to);
    const gross = round(orders.reduce((n, o) => n + o.total, 0)), returned = round(returns.reduce((n, r) => n + r.amount, 0));
    return {orders, returns, gross, returned, total: round(gross - returned), count: orders.length, units, from, to};
  }
  function stockPeriod(s, filters = {}) {
    const {from, to} = period(s, filters), units = authorizedUnits(s, filters.unit), before = F.offset(-1, from);
    const rows = [];
    for (const unit of units) {
      const locs = s.locations.filter(l => l.unit === unit && (!filters.loc || l.id === filters.loc)).map(l => l.id);
      for (const p of s.products.filter(p => p.active && (!filters.product || p.id === filters.product) && (!filters.kind || p.kind === filters.kind))) {
        const moves = s.moves.filter(m => m.product === p.id && locs.includes(m.loc));
        const opening = round(moves.filter(m => m.date <= before).reduce((n, m) => n + m.qty, 0));
        const selected = moves.filter(m => m.date >= from && m.date <= to);
        const entries = round(selected.filter(m => m.qty > 0).reduce((n, m) => n + m.qty, 0));
        const exits = round(-selected.filter(m => m.qty < 0).reduce((n, m) => n + m.qty, 0));
        const closing = round(opening + entries - exits), v = F.priceAt(s, p.id, to);
        if (opening || entries || exits || closing) rows.push({product: p, unit, opening, entries, exits, closing, qty: closing, cost: round(closing * v.cost), value: round(closing * v.price), unitCost: v.cost, unitPrice: v.price, from, to});
      }
    }
    return rows;
  }
  function stockSnapshot(s, unit, date) {
    const units = authorizedUnits(s, unit), locs = s.locations.filter(l => units.includes(l.unit)).map(l => l.id);
    return s.products.filter(p => p.active && p.kind === 'acabado').map(p => {
      const qty = round(locs.reduce((n, loc) => n + F.at(s, p.id, loc, date), 0));
      const v = F.priceAt(s, p.id, date);
      return {product: p.id, qty, price: v.price, cost: v.cost};
    }).filter(r => r.qty);
  }
  function targetCalc(s, filters = {}) {
    ensure(s);
    const {from, to} = period(s, filters), unit = filters.unit || s.unit, units = authorizedUnits(s, unit), basis = filters.basis === 'cost' ? 'cost' : filters.basis === 'qty' ? 'qty' : 'price';
    const prior = s.targetHistory.filter(t => t.unit === unit && t.to < from).sort((a, b) => b.to.localeCompare(a.to) || (b.revision || 0) - (a.revision || 0))[0];
    const previousDate = prior?.to || F.offset(-1, from);
    const previousStocks = prior?.closingStocks || stockSnapshot(s, unit, previousDate);
    const valuation = r => basis === 'qty' ? r.qty : r.qty * r[basis];
    const previous = round(previousStocks.reduce((n, r) => n + valuation(r), 0));
    const locs = s.locations.filter(l => units.includes(l.unit)).map(l => l.id);
    const entriesMoves = s.moves.filter(m => m.qty > 0 && m.date >= from && m.date <= to && locs.includes(m.loc) && s.products.find(p => p.id === m.product)?.kind === 'acabado' && !/devolu|retorno|estorno|saldo de abertura/i.test(m.reason));
    const eligible = entriesMoves.filter(m => !s.moves.some(other => other.product === m.product && other.ref && other.ref === m.ref && other.date === m.date && other.qty === -m.qty && locs.includes(other.loc) && other.loc !== m.loc));
    const entries = round(eligible.reduce((n, m) => {const v = F.priceAt(s, m.product, m.date); return n + m.qty * (basis === 'qty' ? 1 : v[basis]);}, 0));
    const previousPart = round(previous * .4), entriesPart = round(entries * .7), target = round(previousPart + entriesPart);
    const closingStocks = stockSnapshot(s, unit, to), closingValue = round(closingStocks.reduce((n, r) => n + valuation(r), 0));
    return {unit, units, from, to, basis, previous, entries, previousPart, entriesPart, target, base: target, previousDate, previousGoalId: prior?.id || null, previousStocks: copy(previousStocks), closingStocks, closingValue, entryIds: eligible.map(m => m.id), explanation: '40% do saldo ao fim da última meta anterior ao início selecionado (ou saldo anterior ao início na primeira meta), mais 70% das entradas externas e da produção do período. Transferências dentro do escopo, devoluções e saldos de implantação não compõem entradas.'};
  }
  function saveTarget(s, data) {
    return transaction(s, () => {
      const result = targetCalc(s, data);
      assert(!s.targetHistory.some(t => t.unit === result.unit && (t.from !== result.from || t.to !== result.to) && t.from <= result.to && t.to >= result.from), 'O período se sobrepõe a uma meta existente.');
      const levels = data.levels || s.settings.levels || [100, 110, 120, 130];
      assert(Array.isArray(levels) && levels.length === 4 && levels.every((n, i) => Number.isFinite(Number(n)) && Number(n) > 0 && (i === 0 || Number(n) > Number(levels[i - 1]))), 'Informe quatro níveis percentuais crescentes.');
      const existing = s.targetHistory.filter(t => t.unit === result.unit && t.from === result.from && t.to === result.to);
      const goal = {...result, id: F.id(s, 'META'), revision: existing.length + 1, created: stamp(), actor: user(s)?.name || 'Equipe', levels: levels.map(Number)};
      s.targetHistory.push(goal);
      s.targets[result.unit] = copy(goal);
      F.log(s, 'Meta salva para ' + result.from + ' a ' + result.to + ': ' + result.target + '.');
      return goal;
    });
  }

  function importProduction(s, state) {
    return transaction(s, () => {
      ensure(s);
      assert(state && state.app === 'carola-production' && state.schema === 1 && Array.isArray(state.stockEntries) && Array.isArray(state.pieces), 'Dados de produção incompatíveis.');
      let imported = 0, materials = 0;
      const normalizeDate = date => {const d = dateOnly(date); return dateValid(d) && d >= s.floor && d <= today() ? d : today();};
      for (const m of state.materials || []) {
        const key = 'material:' + m.id;
        // O formulário insere no início: em datas iguais, os últimos registros do array são mais antigos.
        const materialEntries = (state.materialEntries || []).map((entry, index) => ({entry, index})).filter(x => x.entry.materialId === m.id)
          .sort((a, b) => dateOnly(a.entry.date).localeCompare(dateOnly(b.entry.date)) || b.index - a.index).map(x => x.entry);
        let p = s.products.find(p => p.sourceMaterialKey === key);
        if (!p) {
          p = {id: F.id(s, 'MP-PROD'), name: text(m.name), ref: 'MP-PROD-' + m.id, kind: 'materia', category: 'Tecidos', color: text(m.color), size: '—', min: 0, price: 0, cost: 0, um: m.unit || 'm', barcode: '27' + String(++s.sequence).padStart(11, '0'), collection: '', active: m.active !== false, published: false, source: 'production', sourceMaterialKey: key, materialAutoPrice: true, syncedMaterialPrice: 0, prices: [{date: s.floor, price: 0, cost: 0}]};
          s.products.push(p);
        }
        if (p.materialAutoPrice && p.price !== p.syncedMaterialPrice) p.materialAutoPrice = false;
        p.name = text(m.name); p.color = text(m.color); p.um = m.unit || 'm'; p.active = m.active !== false; p.composition = copy(m.composition || []); p.yield = copy(m.yield || {kg: 0, metersPerKg: 0, meters: 0}); p.supplier = text(m.supplier);
        let receivedNewMaterial = false;
        for (const entry of materialEntries) {
          const id = 'material-entry:' + entry.id;
          if (s.integration.materialEntryIds.includes(id)) continue;
          const qty = F.number(entry.qty, .001), d = normalizeDate(entry.date), cost = round(F.number(entry.unitCost || 0));
          const historicalPrice = p.materialAutoPrice ? cost : F.priceAt(s, p.id, d).price;
          p.prices.push({date: d, price: historicalPrice, cost, sourceEntryId: entry.id});
          if (p.materialAutoPrice) {p.price = cost; p.syncedMaterialPrice = cost;}
          p.cost = cost;
          F.move(s, p.id, 'raw', qty, 'Entrada de matéria-prima da produção', d, id);
          const movement = s.moves.at(-1);
          movement.source = 'production'; movement.sourceDate = entry.date; movement.sourceEntry = copy(entry); movement.cost = cost;
          s.integration.materialEntryIds.push(id); materials++; receivedNewMaterial = true;
        }
        if (receivedNewMaterial) {
          const latest = F.priceAt(s, p.id, today());
          p.cost = latest.cost;
          if (p.materialAutoPrice) {p.price = latest.price; p.syncedMaterialPrice = latest.price;}
        }
      }
      for (const e of state.stockEntries) {
        const id = 'production-entry:' + e.id;
        if (s.integration.productionIds.includes(id)) continue;
        assert(e.id && e.pieceId && Array.isArray(e.rows), 'Entrada de produção inválida.');
        const piece = state.pieces.find(p => p.id === e.pieceId), date = normalizeDate(e.date);
        const importedLines = [];
        for (const r of e.rows) {
          const normal = F.qty(r.normal || 0), second = F.qty(r.second || 0), rejected = F.qty(r.rejected || 0);
          for (const [quality, qty] of [['normal', normal], ['segunda', second]]) {
            if (!qty) continue;
            const variant = [e.ref, e.color, r.size, quality].map(x => text(x).toUpperCase()).join('|');
            let p = s.products.find(p => p.sourceVariantKey === variant);
            if (!p) {
              const price = Number(piece?.price) || 0, cost = Number(piece?.cost) || 0;
              p = {id: F.id(s, 'PROD'), name: text(e.name) + (quality === 'segunda' ? ' · 2ª linha' : ''), ref: text(e.ref) + '-' + text(e.color).replace(/\s+/g, '-').toUpperCase() + '-' + text(r.size) + (quality === 'segunda' ? '-2L' : ''), sourceRef: text(e.ref), category: piece?.category || 'Produção', price, cost, color: text(e.color), size: text(r.size), min: 0, kind: 'acabado', um: 'peça', barcode: '28' + String(++s.sequence).padStart(11, '0'), collection: piece?.collection || '', published: false, active: true, source: 'production', sourceVariantKey: variant, quality, pricePending: price <= 0, prices: [{date: s.floor, price, cost}], sourceProductionIds: []};
              s.products.push(p);
            }
            p.sourceProductionIds ||= [];
            if (!p.sourceProductionIds.includes(e.pieceId)) p.sourceProductionIds.push(e.pieceId);
            p.lot = piece?.lot || e.pieceId;
            F.move(s, p.id, 'fab', qty, quality === 'normal' ? 'Conclusão da produção · normal' : 'Conclusão da produção · segunda linha', date, id);
            const movement = s.moves.at(-1);
            Object.assign(movement, {source: 'production', sourceDate: e.date, sourceEntryId: e.id, sourcePieceId: e.pieceId, lot: p.lot, quality});
            importedLines.push({product: p.id, size: r.size, quality, qty});
          }
          if (rejected) importedLines.push({product: null, size: r.size, quality: 'rejeitada', qty: rejected});
        }
        s.integration.productionIds.push(id);
        s.integration.productionImports.push({id, sourceEntryId: e.id, pieceId: e.pieceId, ref: e.ref, color: e.color, date, sourceDate: e.date, lot: piece?.lot || e.pieceId, approval: e.approval, labels: {composition: copy(e.compositionLabel || null), barcode: copy(e.barcodeLabel || null)}, lines: importedLines});
        imported++;
      }
      const active = state.pieces.filter(p => !p.finished && !p.archived);
      s.integration.productionSummary = {active: active.length, planned: active.reduce((n, p) => n + (p.grade || []).reduce((a, g) => a + Number(g.qty || 0), 0), 0), late: active.filter(p => p.due < today()).length, quality: active.filter(p => p.stage === 11).length, finished: state.pieces.filter(p => p.finished).length, lastSync: stamp()};
      s.integration.productionPieces = state.pieces.map(p => ({id: p.id, ref: p.ref, name: p.name, color: p.color, collection: p.collection, lot: p.lot, stage: p.stage, due: p.due, grade: copy(p.grade), finished: p.finished, archived: p.archived}));
      if (imported) F.log(s, imported + ' finalização(ões) integrada(s) ao estoque da fábrica.');
      return {ids: s.integration.productionIds.map(id => id.replace(/^production-entry:/, '')), imported, materials};
    });
  }

  F.sell = sell;
  F.invoiceBudget = invoiceBudget;
  F.issueNote = issueNote;
  F.returnSale = returnSale;
  F.cashExpected = cashExpected;
  F.newConsignment = newConsignment;
  F.settleConsignment = settleConsignment;
  return {migrate, importProduction, sales, stockPeriod, targetCalc, saveTarget, upsertStore, authenticateStore, checkout, setOrderStatus, updateConsignment, authorizedUnits, period, ORDER_STATUSES};
});
