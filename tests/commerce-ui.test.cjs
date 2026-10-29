/*
 * Executar com: node --test tests/commerce-ui.test.cjs
 *
 * Exercita as views e os handlers comerciais reais em uma VM isolada, usando
 * as regras reais de core.js e integration-core.js. O DOM mínimo representa
 * somente os pontos usados pelos handlers. Estes testes não avaliam layout,
 * acessibilidade do navegador ou submissão nativa de formulários HTML.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const project = path.resolve(__dirname, '..');
const sources = ['core.js', 'integration-core.js', 'commerce-ui.js'].map(name => ({
  name,
  text: fs.readFileSync(path.join(project, name), 'utf8')
}));

function freshApp() {
  const listeners = new Map();
  const classes = new Set();
  const stored = new Map();
  const selectorNodes = new Map();
  const fieldNode = () => ({
    value: '', required: false, disabled: false, textContent: '',
    insertAdjacentHTML() {}
  });
  const document = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    querySelector(selector) {
      if (!selectorNodes.has(selector)) {
        selectorNodes.set(selector, selector === '#dialog' ? {
          querySelector: inner => {
            const key = '#dialog ' + inner;
            if (!selectorNodes.has(key)) selectorNodes.set(key, fieldNode());
            return selectorNodes.get(key);
          },
          insertAdjacentHTML() {}
        } : fieldNode());
      }
      return selectorNodes.get(selector);
    },
    querySelectorAll() { return []; },
    body: {
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name); else classes.delete(name);
        }
      }
    }
  };
  const sandbox = {
    console,
    document,
    sessionStorage: {
      getItem: key => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, String(value))
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const source of sources) vm.runInContext(source.text, sandbox, { filename: source.name });

  const F = sandbox.Fluxo;
  const C = sandbox.CarolaDomain;
  const state = F.seed();
  C.migrate(state);
  const E = sandbox.CarolaExtensions;
  let route = 'lojas', html = '', modal = null, receipt = null;
  const messages = [], exports = [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const opts = (items, selected) => items.map(item => {
    const [value, label] = Array.isArray(item) ? item : [item, item];
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  const input = (label, name, value = '', type = 'text', attributes = '') =>
    `<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${attributes}></label>`;
  const A = {
    get state() { return state; },
    get route() { return route; },
    F, esc, brl, num, opts, input,
    dt: date => date ? String(date).split('-').reverse().join('/') : '—',
    icon: name => `<svg aria-hidden="true"><title>${esc(name)}</title></svg>`,
    select: (label, name, items, selected, attributes = '') =>
      `<label>${label}<select name="${name}" ${attributes}>${opts(items, selected)}</select></label>`,
    textArea: (label, name) => `<label>${label}<textarea name="${name}"></textarea></label>`,
    badge: (label, color) => `<span class="badge ${color || ''}">${esc(label)}</span>`,
    stat: (label, value) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`,
    empty: label => `<div class="empty">${label}</div>`,
    table: (heads, rows) => `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
    header: (description, actions) => `<header><h1>${description}</h1>${actions || ''}</header>`,
    netOrder: order => Math.max(0, F.round(order.total - state.returns.filter(item => item.orderId === order.id).reduce((sum, item) => sum + item.amount, 0))),
    unitName: id => state.units.find(unit => unit.id === id)?.name || id,
    modal(title, body, form) { modal = { title, body, form }; },
    close() { modal = null; },
    save() {},
    toast(message, error) { messages.push({ message, error: !!error }); },
    render() {
      html = E.views[route]();
      E.afterRender.forEach(fn => fn());
    },
    transaction(fn, message) {
      let result;
      F.atomic(state, () => { result = fn(state); });
      this.close();
      this.render();
      if (message) this.toast(message);
      return result;
    },
    go(next) { route = next; this.render(); },
    csv(name, heads, rows) { exports.push({ name, heads, rows }); },
    printDoc(title, body) { receipt = { title, body }; }
  };
  E.installers.forEach(install => install(A));
  return {
    A, E, F, C, state, sandbox, classes, messages, exports,
    get ui() { return sandbox.CarolaCommerce.ui; },
    get html() { return html; },
    get modal() { return modal; },
    get receipt() { return receipt; },
    navigate(next) { A.go(next); },
    login(storeId = 'store-mar', role = 'gerente') {
      A.go('pdv');
      E.forms['x-pos-login']({}, { storeId, login: role, password: role + '123' });
      return sandbox.CarolaCommerce.currentSession();
    },
    physicalSale(overrides = {}) {
      const session = sandbox.CarolaCommerce.currentSession();
      assert.ok(session, 'O teste deve autenticar a loja antes da venda.');
      E.actions['x-pos-add'](overrides.product || 'p1');
      E.forms['x-pos-checkout']({}, {
        client: 'Cliente de teste comercial', clientCity: 'Maringá', clientState: 'PR',
        sellerId: session.userId, method: 'Pix', installments: '1', discount: '0', ...overrides
      });
      return state.orders[0];
    },
    onlineSale(overrides = {}) {
      A.go('loja');
      E.actions['x-shop-add']('p1');
      E.actions['x-shop-checkout']();
      assert.match(html, /Concluir seu pedido/);
      E.forms['x-shop-checkout']({}, {
        client: 'Cliente online de teste', clientCity: 'Curitiba', clientState: 'PR',
        email: 'teste@exemplo.test', phone: '41999999999', zip: '80000-000',
        address: 'Rua de teste', addressNumber: '123, ap. 4', method: 'Cartão', installments: '3', ...overrides
      });
      return state.orders[0];
    }
  };
}

function datedSale(app, { unit = 'mar', product = 'p1', qty = 1, date = app.F.today, sellerId = 'ana', returnedQty = 0, returnDate = app.F.today } = {}) {
  const { state, F, C } = app;
  const storeId = state.stores.find(store => store.unit === unit).id;
  const session = C.authenticateStore(state, storeId, 'gerente', 'gerente123');
  const order = C.checkout(state, {
    unit, storeId, session, channel: 'Loja física', client: 'Cliente datado ' + state.sequence,
    clientCity: unit === 'cia' ? 'Cianorte' : 'Maringá', clientState: 'PR',
    items: [{ product, qty }], method: 'Pix', installments: 1, discount: 0,
    seller: state.users.find(user => user.id === sellerId)?.name
  });
  // O relógio de produção é fixo durante a sessão. Reposicione os documentos
  // e seus movimentos para reproduzir vendas anteriores sem simular a regra
  // do relatório ou o cálculo do crédito.
  order.date = date;
  state.moves.filter(move => move.ref === order.id).forEach(move => { move.date = date; });
  state.titles.filter(title => title.orderId === order.id).forEach(title => { title.date = date; });
  let returned = null;
  if (returnedQty) {
    returned = F.returnSale(state, order.id, product, returnedQty, 'Devolução datada para teste');
    returned.date = returnDate;
    state.moves.filter(move => move.ref === order.id && /devolu/i.test(move.reason)).forEach(move => { move.date = returnDate; });
  }
  return { order, returned };
}

for (const [route, expected] of [
  ['lojas', /Lojas, unidades de estoque/],
  ['pdv', /Acessar ponto de venda/],
  ['loja', /A coleção/],
  ['pedidos', /Todos os canais/],
  ['consignacoes', /Envios, devoluções e novos itens/]
]) {
  test('renderiza a área comercial ' + route, () => {
    const app = freshApp();
    app.navigate(route);
    assert.match(app.html, expected);
    assert.ok(app.html.length > 500);
    assert.equal(app.classes.has('environment-retail'), route === 'pdv');
    assert.equal(app.classes.has('environment-shop'), route === 'loja');
  });
}

test('PDV autentica a loja, baixa seu estoque e mantém a sessão da gestão', () => {
  const app = freshApp(), { state, F, E } = app;
  app.navigate('pdv');
  assert.throws(() => E.forms['x-pos-login']({}, { storeId: 'store-mar', login: 'gerente', password: 'errada' }), /inválidos/);
  assert.equal(app.sandbox.CarolaCommerce.currentSession(), null);
  const contextBefore = { user: state.user, unit: state.unit }, session = app.login();
  const marBefore = F.at(state, 'p1', 'mar'), fabBefore = F.at(state, 'p1', 'fab');
  const order = app.physicalSale();
  assert.equal(order.unit, 'mar');
  assert.equal(order.storeId, 'store-mar');
  assert.equal(order.sellerId, session.userId);
  assert.equal(order.status, 'Faturamento');
  assert.equal(order.stockPosted, true);
  assert.equal(F.at(state, 'p1', 'mar'), marBefore - 1);
  assert.equal(F.at(state, 'p1', 'fab'), fabBefore);
  assert.equal(state.user, contextBefore.user);
  assert.equal(state.unit, contextBefore.unit);
  assert.equal(state.titles.filter(title => title.orderId === order.id).length, 1);
  assert.equal(app.ui.posCart.length, 0);
  assert.match(app.modal.body, /Nota fiscal ainda não emitida/);
  E.actions['x-print-receipt'](order.id);
  assert.match(app.receipt.title, new RegExp(order.id));
  assert.match(app.receipt.body, /Cliente de teste comercial/);
});

test('PDV do vendedor bloqueia desconto acima de 15% e conserva estoque e documentos', () => {
  const app = freshApp(), { state, F, E } = app;
  app.login('store-mar', 'vendedor');
  E.actions['x-pos-add']('p1');
  const before = JSON.stringify(state), count = app.ui.posCart.length;
  assert.throws(() => E.forms['x-pos-checkout']({}, {
    client: 'Desconto inválido', method: 'Pix', installments: '1', discount: '60',
    sellerId: app.sandbox.CarolaCommerce.currentSession().userId
  }), /15%/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(app.ui.posCart.length, count);
  assert.equal(F.at(state, 'p1', 'mar'), JSON.parse(before).moves.filter(m => m.product === 'p1' && m.loc === 'mar').reduce((n, m) => n + m.qty, 0));
});

test('troca aplica o crédito e registra somente a diferença no caixa', () => {
  const app = freshApp(), { state, F, E } = app;
  const session = app.login(), sold = app.physicalSale();
  const cash = state.cash.find(item => item.unit === 'mar' && item.open && item.users.includes(session.userId));
  const expectedBefore = F.cashExpected(state, cash.id);
  const p1Before = F.at(state, 'p1', 'mar'), p2Before = F.at(state, 'p2', 'mar');
  E.forms['x-pos-return']({}, {
    product: 'p1', qty: '1', reason: 'Troca por outro modelo', replacement: 'p2', replacementQty: '1', method: 'Dinheiro'
  }, sold.id);
  const replacement = state.orders[0];
  assert.equal(sold.status, 'Devolução de produtos');
  assert.equal(replacement.exchangeOf, sold.id);
  assert.equal(replacement.total, 379);
  assert.equal(replacement.creditApplied, 289);
  assert.equal(replacement.paidDifference, 90);
  assert.equal(F.cashExpected(state, cash.id) - expectedBefore, 90);
  assert.equal(F.at(state, 'p1', 'mar'), p1Before + 1);
  assert.equal(F.at(state, 'p2', 'mar'), p2Before - 1);
  assert.equal(state.titles.filter(t => t.orderId === replacement.id && t.type === 'receber').reduce((n, t) => n + t.amount, 0), 90);
  const refund = state.titles.find(t => t.orderId === sold.id && t.type === 'pagar');
  assert.equal(refund.amount, 0);
  assert.equal(refund.status, 'Pago');
});

test('troca recusada por falta de estoque reverte também a devolução original', () => {
  const app = freshApp(), { state, F, E } = app;
  app.login();
  const sold = app.physicalSale();
  F.move(state, 'p2', 'mar', -F.at(state, 'p2', 'mar'), 'Esgotamento de teste');
  const before = JSON.stringify(state);
  assert.throws(() => E.forms['x-pos-return']({}, {
    product: 'p1', qty: '1', reason: 'Troca sem saldo', replacement: 'p2', replacementQty: '1', method: 'Pix'
  }, sold.id), /Estoque insuficiente/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(app.state.orders.find(o => o.id === sold.id).items[0].returned || 0, 0);
});

test('e-commerce confirma endereço e parcelas, emite nota e acompanha envio e entrega', () => {
  const app = freshApp(), { state, F, E } = app;
  const before = F.at(state, 'p1', 'fab'), order = app.onlineSale();
  assert.equal(order.channel, 'E-commerce');
  assert.equal(order.status, 'Em separação');
  assert.equal(order.billingStatus, 'Faturamento');
  assert.equal(order.installments, 3);
  assert.equal(F.at(state, 'p1', 'fab'), before - 1);
  assert.match(order.shippingAddress, /Rua de teste, 123, ap\. 4/);
  assert.match(order.shippingAddress, /Curitiba\/PR/);
  assert.match(order.shippingAddress, /80000-000/);
  const titles = state.titles.filter(title => title.orderId === order.id && title.type === 'receber');
  assert.equal(titles.length, 3);
  assert.equal(F.round(titles.reduce((n, title) => n + title.amount, 0)), order.total);
  assert.equal(new Set(titles.map(title => title.due)).size, 3);
  assert.equal(app.ui.shopCart.length, 0);
  assert.equal(app.ui.shopStep, 'pedidos');
  assert.equal(app.ui.shopOrder, order.id);
  assert.match(app.html, /Em separação/);
  app.navigate('pedidos');
  assert.throws(() => E.forms['x-order-send']({}, { trackingCode: 'BC-TESTE', note: '' }, order.id), /Emita a nota/);
  // O rollback reconstitui as listas; recupere a referência atual a cada etapa.
  E.actions['x-order-note'](order.id);
  const issued = state.orders.find(o => o.id === order.id);
  assert.equal(issued.billingStatus, 'Pedido faturado');
  assert.equal(issued.status, 'Em separação');
  assert.equal(state.notes.filter(note => note.orderId === order.id).length, 1);
  assert.throws(() => E.actions['x-order-note'](order.id), /nota ativa/);
  E.forms['x-order-send']({}, { trackingCode: 'BC-TESTE123BR', note: 'Pedido separado' }, order.id);
  assert.equal(state.orders.find(o => o.id === order.id).status, 'Enviado');
  assert.equal(state.orders.find(o => o.id === order.id).trackingCode, 'BC-TESTE123BR');
  app.navigate('loja');
  E.actions['x-shop-track-order'](order.id);
  assert.match(app.html, /Recebi meu pedido/);
  E.actions['x-shop-delivered'](order.id);
  assert.equal(state.orders.find(o => o.id === order.id).status, 'Entregue');
  assert.match(app.html, /Entrega confirmada/);
  assert.equal(F.at(state, 'p1', 'fab'), before - 1, 'Nota e entrega não podem baixar o estoque novamente.');
});

test('romaneio adiciona peças, devolve e corrige com histórico compensatório', () => {
  const app = freshApp(), { state, F, E } = app;
  app.navigate('consignacoes');
  const rom = state.consignments[0], first = rom.items[0];
  const firstOrigin = F.at(state, first.product, rom.from), firstThird = F.at(state, first.product, rom.loc);
  const addedOrigin = F.at(state, 'p2', rom.from), addedThird = F.at(state, 'p2', rom.loc), ledgerBefore = rom.ledger.length;
  const form = {
    querySelectorAll() {
      return [{ querySelector: selector => ({ value: selector === '[name=addProduct]' ? 'p2' : '2' }) }];
    }
  };
  E.forms['x-rom-edit'](form, { returned0: '1', returned1: '0', reason: 'Novas peças e retorno parcial' }, rom.id);
  assert.equal(rom.items.find(i => i.product === 'p2').qty, 2);
  assert.equal(first.returned, 1);
  assert.equal(F.at(state, first.product, rom.from), firstOrigin + 1);
  assert.equal(F.at(state, first.product, rom.loc), firstThird - 1);
  assert.equal(F.at(state, 'p2', rom.from), addedOrigin - 2);
  assert.equal(F.at(state, 'p2', rom.loc), addedThird + 2);
  assert.equal(rom.ledger.length, ledgerBefore + 1);
  const firstEntry = JSON.stringify(rom.ledger[ledgerBefore]);
  E.forms['x-rom-correct']({}, { returned0: '1', returned1: '0', returned2: '0', reason: 'Correção do retorno anterior' }, rom.id);
  assert.equal(first.returned, 0);
  assert.equal(F.at(state, first.product, rom.from), firstOrigin);
  assert.equal(F.at(state, first.product, rom.loc), firstThird);
  assert.equal(rom.ledger.length, ledgerBefore + 2);
  assert.equal(JSON.stringify(rom.ledger[ledgerBefore]), firstEntry, 'O lançamento anterior deve ser preservado.');
  assert.equal(rom.ledger.at(-1).returns[0].qty, -1);
  E.actions['x-rom-details'](rom.id);
  assert.match(app.modal.body, /Novas peças e retorno parcial/);
  assert.match(app.modal.body, /Correção do retorno anterior/);
});

test('relatórios do PDV exibem e exportam apenas vendas da loja autenticada', () => {
  const app = freshApp(), { E, state } = app;
  app.login('store-mar');
  const order = app.physicalSale();
  E.forms['x-pos-report']({}, { from: app.F.today, to: app.F.today, seller: '' });
  E.actions['x-pos-tab']('relatorios');
  assert.match(app.html, new RegExp(order.id));
  E.actions['x-pos-export']();
  const exported = app.exports.at(-1);
  assert.equal(exported.name, 'vendas_mar.csv');
  assert.ok(exported.rows.length > 0);
  exported.rows.forEach(row => {
    const source = state.orders.find(o => o.id === row[2]);
    assert.equal(source.unit, 'mar');
    assert.equal(source.date, app.F.today);
  });
  for (const tab of ['venda', 'relatorios', 'devolucoes']) {
    E.actions['x-pos-tab'](tab);
    assert.ok(app.html.length > 500);
  }
});

test('relatório PDV reconhece a devolução de venda antiga no período próprio e filtra loja e vendedor', () => {
  const app = freshApp(), { state, F, E } = app;
  app.login('store-mar');
  state.orders = []; state.returns = []; state.titles = []; state.notes = [];
  const old = datedSale(app, { qty: 2, date: F.offset(-4), returnedQty: 1, returnDate: F.today });
  // A vinculação histórica por nome continua válida quando o documento
  // anterior ainda não tinha o identificador do vendedor.
  delete old.order.sellerId;
  const current = datedSale(app, { product: 'p2', sellerId: 'ana' });
  const otherSeller = datedSale(app, { product: 'p3', sellerId: 'vin' });
  const otherStore = datedSale(app, { unit: 'cia', sellerId: 'bia', date: F.offset(-4), returnedQty: 1 });
  E.forms['x-pos-report']({}, { from: F.today, to: F.today, seller: 'ana' });
  E.actions['x-pos-tab']('relatorios');
  E.actions['x-pos-export']();
  const exported = app.exports.at(-1);
  assert.equal(exported.rows.length, 2);
  const saleRow = exported.rows.find(row => row[4] === 'Venda');
  const returnRow = exported.rows.find(row => row[4] === 'Devolução');
  assert.equal(saleRow[2], current.order.id);
  assert.equal(saleRow[8], 1);
  assert.equal(saleRow[9], 379);
  assert.equal(returnRow[2], old.returned.id);
  assert.equal(returnRow[3], old.order.id);
  assert.equal(returnRow[1], F.today);
  assert.equal(returnRow[8], -1);
  assert.equal(returnRow[9], -289);
  assert.equal(exported.rows.reduce((sum, row) => sum + row[9], 0), 90);
  assert.equal(exported.rows.reduce((sum, row) => sum + row[8], 0), 0);
  assert.ok(app.html.includes(old.returned.id), 'A tabela deve exibir o documento da devolução.');
  assert.ok(app.html.includes('Venda de origem: ' + old.order.id));
  assert.ok(app.html.includes('Receita líquida</span><strong>' + app.A.brl(90)));
  assert.ok(app.html.includes('Peças líquidas</span><strong>0'));
  assert.ok(!app.html.includes(otherSeller.order.id));
  assert.ok(!app.html.includes(otherStore.order.id));
  assert.ok(!app.html.includes(otherStore.returned.id));
  exported.rows.forEach(row => assert.equal(row[0], 'Loja Maringá'));
});

test('relatório PDV não antecipa devolução posterior e reconcilia período só com devolução', () => {
  const app = freshApp(), { state, F, E } = app;
  app.login('store-mar');
  state.orders = []; state.returns = []; state.titles = []; state.notes = [];
  const date = F.offset(-3), item = datedSale(app, { qty: 2, date, returnedQty: 1, returnDate: F.today });
  E.forms['x-pos-report']({}, { from: date, to: date, seller: 'ana' });
  E.actions['x-pos-tab']('relatorios');
  E.actions['x-pos-export']();
  const historical = app.exports.at(-1);
  assert.equal(historical.rows.length, 1);
  assert.equal(historical.rows[0][2], item.order.id);
  assert.equal(historical.rows[0][4], 'Venda');
  assert.equal(historical.rows[0][8], 2, 'O histórico da venda conserva as peças vendidas naquele dia.');
  assert.equal(historical.rows[0][9], 578, 'A devolução posterior não reduz a venda no período original.');
  assert.ok(!app.html.includes(item.returned.id));
  assert.ok(app.html.includes('Receita líquida</span><strong>' + app.A.brl(578)));

  E.forms['x-pos-report']({}, { from: F.today, to: F.today, seller: 'ana' });
  E.actions['x-pos-export']();
  const current = app.exports.at(-1);
  assert.equal(current.rows.length, 1);
  assert.equal(current.rows[0][2], item.returned.id);
  assert.equal(current.rows[0][3], item.order.id);
  assert.equal(current.rows[0][4], 'Devolução');
  assert.equal(current.rows[0][8], -1);
  assert.equal(current.rows[0][9], -289);
  assert.ok(app.html.includes('Vendas no período</span><strong>0'));
  assert.ok(app.html.includes('Receita líquida</span><strong>' + app.A.brl(-289)));
  assert.ok(app.html.includes('Peças líquidas</span><strong>-1'));
});

test('pedidos projeta o romaneio consignado e exporta valor em posse sem criar venda ou recebível', () => {
  const app = freshApp(), { state, F, E } = app;
  app.navigate('pedidos');
  const rom = state.consignments.find(item => item.id === 'ROM-0101');
  assert.ok(rom);
  const before = JSON.stringify(state);
  const expected = F.round(rom.items.reduce((sum, item) => sum + (item.qty - item.sold - item.returned - (item.damaged || 0)) * item.price, 0));
  E.forms['x-orders-filter']({}, { status: 'Consignado', q: 'Tiago', unit: 'fab', channel: 'Representante', from: state.floor, to: F.today });
  assert.ok(app.html.includes(rom.id));
  assert.ok(app.html.includes('data-action="x-rom-details"'));
  assert.ok(app.html.includes('Valor em posse'));
  assert.ok(app.html.includes(app.A.brl(expected)));
  assert.ok(app.html.includes('Vendas líquidas</span><strong>' + app.A.brl(0)), 'Peças consignadas ainda não são receita.');
  E.actions['x-orders-export']();
  const exported = app.exports.at(-1);
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0][0], rom.id);
  assert.equal(exported.rows[0][3], state.contacts.find(contact => contact.id === rom.rep).name);
  assert.equal(exported.rows[0][7], 'Representante');
  assert.equal(exported.rows[0][8], 'Consignado');
  assert.equal(exported.rows[0].at(-1), expected);
  assert.equal(state.orders.some(order => order.id === rom.id), false);
  assert.equal(JSON.stringify(state), before, 'Consultar e exportar não pode criar venda, título ou movimento.');

  E.forms['x-orders-filter']({}, { status: 'Consignado', unit: 'mar', from: state.floor, to: F.today });
  E.actions['x-orders-export']();
  assert.equal(app.exports.at(-1).rows.length, 0);
  assert.ok(!app.html.includes(rom.id), 'O romaneio da fábrica não aparece na consulta da loja.');
  E.forms['x-orders-filter']({}, { status: 'Consignado', unit: 'fab', from: F.offset(1, rom.date), to: F.today });
  E.actions['x-orders-export']();
  assert.equal(app.exports.at(-1).rows.length, 0, 'O filtro de período respeita a data original do romaneio.');
  assert.equal(JSON.stringify(state), before);
});

test('projeção consignada usa apenas o saldo em posse e desaparece quando encerrada', () => {
  const app = freshApp(), { state, F, E } = app;
  app.navigate('pedidos');
  const rom = state.consignments[0];
  F.settleConsignment(state, rom.id, [{ sold: 1, returned: 2 }, { sold: 0, returned: 1 }]);
  const expected = F.round(rom.items.reduce((sum, item) => sum + (item.qty - item.sold - item.returned) * item.price, 0));
  const before = JSON.stringify(state);
  E.forms['x-orders-filter']({}, { status: 'Consignado', from: state.floor, to: F.today });
  E.actions['x-orders-export']();
  assert.equal(app.exports.at(-1).rows[0].at(-1), expected);
  assert.ok(app.html.includes('6 peça(s)'));
  assert.equal(JSON.stringify(state), before);
  F.settleConsignment(state, rom.id, rom.items.map(item => ({ sold: item.qty - item.sold - item.returned, returned: 0 })));
  E.actions['x-orders-export']();
  assert.equal(app.exports.at(-1).rows.length, 0);
});

test('recibo exige exportação na gestão ou uma sessão PDV da própria loja', () => {
  const app = freshApp(), { state, F, E } = app;
  const manager = state.users.find(user => user.id === state.user);
  app.navigate('pedidos');
  const initial = state.orders.find(order => order.unit === 'fab' && order.status !== 'Orçamento');
  manager.permissions.pedidos.export = false;
  E.actions['x-order-details'](initial.id);
  assert.ok(!app.modal.body.includes('data-action="x-print-receipt"'));
  assert.throws(() => E.actions['x-print-receipt'](initial.id), /Sem permissão para imprimir/);
  assert.equal(app.receipt, null);

  app.login('store-mar');
  const own = app.physicalSale();
  E.actions['x-print-receipt'](own.id);
  assert.ok(app.receipt.title.includes(own.id));
  const printed = app.receipt;
  assert.throws(() => E.actions['x-print-receipt'](initial.id), /Sem permissão para imprimir/);
  assert.equal(app.receipt, printed);
  E.actions['x-order-details'](initial.id);
  assert.ok(!app.modal.body.includes('data-action="x-print-receipt"'));
  E.actions['x-pos-logout']();
  manager.permissions.pedidos.export = true;
  assert.throws(() => E.actions['x-print-receipt'](own.id), /Sem permissão para imprimir/, 'No PDV, permissão da gestão não substitui login da loja.');
  app.navigate('pedidos');
  assert.ok(F.allow(state, 'pedidos', 'export'));
  E.actions['x-print-receipt'](own.id);
  assert.ok(app.receipt.title.includes(own.id));
});
