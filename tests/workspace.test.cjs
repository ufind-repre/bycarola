/* Smoke de integração: executa os scripts reais; o DOM mínimo só modela markup, controles e eventos.
   Não substitui a inspeção visual em navegador. Executar: node --test tests/workspace.test.cjs */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function createHarness() {
  const errors = [], warnings = [], windowEvents = new Map(), documentEvents = new Map();
  let document;
  const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const dataName = value => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  function matchesSimple(element, selector) {
    let value = selector.trim();
    const negative = [...value.matchAll(/:not\(([^)]+)\)/g)].map(x => x[1]);
    value = value.replace(/:not\([^)]+\)/g, '');
    if (negative.some(n => matchesSimple(element, n))) return false;
    const tag = value.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && element.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    const id = value.match(/#([\w-]+)/)?.[1];
    if (id && element.id !== id) return false;
    for (const name of [...value.matchAll(/\.([\w-]+)/g)].map(x => x[1])) if (!element.classList.contains(name)) return false;
    for (const item of value.matchAll(/\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g)) {
      const [, attr, double, single, bare] = item;
      if (!element.hasAttribute(attr)) return false;
      const expected = double ?? single ?? bare;
      if (expected !== undefined && element.getAttribute(attr) !== expected) return false;
    }
    return true;
  }
  function matches(element, selector) {
    return selector.split(',').some(part => {
      const chain = part.trim().split(/\s+(?![^\[]*\])/).filter(Boolean);
      if (!matchesSimple(element, chain.pop() || '*')) return false;
      let ancestor = element.parentNode;
      while (chain.length) {
        const wanted = chain.pop();
        while (ancestor && !matchesSimple(ancestor, wanted)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = {...attrs}; this.dataset = {};
      for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) this.dataset[dataName(k.slice(5))] = v;
      this.children = []; this.parentNode = null; this._html = ''; this._value = undefined; this._listeners = new Map();
      this.disabled = 'disabled' in attrs; this.checked = 'checked' in attrs; this.open = false; this.style = {};
      if (tag === 'iframe') this.contentWindow = {messages: [], postMessage(message, origin) {this.messages.push({message, origin});}};
      const self = this;
      this.classList = {
        contains(name) {return self.className.split(/\s+/).includes(name);},
        add(...names) {self.className = [...new Set([...self.className.split(/\s+/).filter(Boolean), ...names])].join(' ');},
        remove(...names) {self.className = self.className.split(/\s+/).filter(x => !names.includes(x)).join(' ');},
        toggle(name, force) {const on = force === undefined ? !this.contains(name) : force; if (on) this.add(name); else this.remove(name); return on;}
      };
    }
    get id() {return this.attributes.id || '';}
    set id(v) {this.attributes.id = v;}
    get name() {return this.attributes.name || '';}
    get type() {return this.attributes.type || (this.tagName === 'BUTTON' ? 'submit' : 'text');}
    get className() {return this.attributes.class || '';}
    set className(v) {this.attributes.class = v;}
    get form() {return this.closest('form');}
    get elements() {return Object.fromEntries(this.querySelectorAll('input,select,textarea,button').filter(x => x.name).map(x => [x.name, x]));}
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.tagName === 'SELECT') {const options = this.querySelectorAll('option'); return options.find(x => x.hasAttribute('selected'))?.getAttribute('value') ?? options[0]?.getAttribute('value') ?? '';}
      if (this.tagName === 'TEXTAREA') return this.textContent;
      return this.attributes.value ?? (this.type === 'checkbox' ? 'on' : '');
    }
    set value(v) {this._value = String(v);}
    get textContent() {return decode(this._html.replace(/<[^>]*>/g, ''));}
    set textContent(v) {this._html = String(v); this.children = [];}
    get innerHTML() {return this._html;}
    set innerHTML(html) {
      this._html = String(html); this.children = [];
      const stack = [this], voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source', 'area', 'wbr']);
      const tokens = this._html.matchAll(/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b([^>]*?)>/gi);
      for (const token of tokens) {
        if (token[0].startsWith('<!--')) continue;
        const tag = token[1].toLowerCase();
        if (token[0].startsWith('</')) {
          const at = stack.map(x => x.tagName.toLowerCase()).lastIndexOf(tag);
          if (at > 0) stack.length = at;
          continue;
        }
        const attrs = {};
        for (const a of token[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
        const child = new Element(tag, attrs); stack.at(-1).append(child);
        if (!voidTags.has(tag) && !token[0].endsWith('/>')) stack.push(child);
      }
    }
    append(...items) {items.forEach(child => {child.parentNode = this; this.children.push(child);});}
    appendChild(child) {this.append(child); return child;}
    remove() {if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null;}
    hasAttribute(name) {return Object.hasOwn(this.attributes, name);}
    getAttribute(name) {return this.attributes[name] ?? null;}
    setAttribute(name, value) {this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[dataName(name.slice(5))] = String(value);}
    matches(selector) {return matches(this, selector);}
    closest(selector) {let x = this; while (x) {if (x.matches(selector)) return x; x = x.parentNode;} return null;}
    querySelectorAll(selector) {const results = []; const visit = e => e.children.forEach(child => {if (child.matches(selector)) results.push(child); visit(child);}); visit(this); return results;}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    addEventListener(name, listener) {if (!this._listeners.has(name)) this._listeners.set(name, []); this._listeners.get(name).push(listener);}
    focus() {document.activeElement = this;}
    showModal() {this.open = true;}
    close() {this.open = false;}
    reportValidity() {return true;}
    getBoundingClientRect() {return {left: 0, top: 0, right: 1000, bottom: 1000};}
    scrollTo() {}
    scrollBy() {}
    scrollIntoView() {}
    setSelectionRange() {}
    click() {}
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const body = new Element('body'); body.innerHTML = html.match(/<body>([^]*?)<\/body>/i)[1];
  document = {body, activeElement: body, title: '',
    createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    getElementById: id => body.querySelector('#' + id),
    addEventListener(name, listener) {if (!documentEvents.has(name)) documentEvents.set(name, []); documentEvents.get(name).push(listener);}
  };
  const makeStorage = () => {const store = new Map(); return {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear()};};
  class FormData {
    constructor(form) {this.items = form.querySelectorAll('input,select,textarea').filter(e => e.name && !e.disabled && (e.type !== 'checkbox' || e.checked)).map(e => [e.name, e.value]);}
    [Symbol.iterator]() {return this.items[Symbol.iterator]();}
    get(name) {return this.items.find(x => x[0] === name)?.[1] ?? null;}
    has(name) {return this.items.some(x => x[0] === name);}
    entries() {return this[Symbol.iterator]();}
  }
  let hash = '';
  const location = {origin: 'http://localhost:4173', href: 'http://localhost:4173/index.html', get hash() {return hash;}, set hash(value) {const next = String(value).startsWith('#') ? String(value) : '#' + value; if (next === hash) return; hash = next; (windowEvents.get('hashchange') || []).forEach(fn => fn({type: 'hashchange'}));}};
  const context = vm.createContext({document, location, localStorage: makeStorage(), sessionStorage: makeStorage(), FormData, Blob, URL, URLSearchParams, TextEncoder, TextDecoder,
    console: {error: (...x) => errors.push(x.map(v => v?.stack || String(v)).join(' ')), warn: (...x) => warnings.push(x.join(' ')), log() {}},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: fn => fn(), scrollTo() {}, print() {},
    addEventListener(name, listener) {if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(listener);}
  });
  context.window = context;
  for (const source of html.matchAll(/<script src="([^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(root, source[1]), 'utf8'), context, {filename: source[1]});
  const A = context.CarolaApp, E = context.CarolaExtensions;
  const event = (target, additions = {}) => ({target, preventDefault() {}, ...additions});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {context, A, E, document, errors, warnings, get markup() {return document.getElementById('main').innerHTML;},
    async change(target, value) {target.value = value; for (const fn of documentEvents.get('change') || []) await fn(event(target)); await flush();},
    async submit(form, values = {}) {for (const [name, value] of Object.entries(values)) {assert.ok(form.elements[name], 'Campo ausente: ' + name); form.elements[name].value = value;} for (const fn of documentEvents.get('submit') || []) await fn(event(form)); await flush();},
    async click(element) {for (const fn of documentEvents.get('click') || []) await fn(event(element)); await flush();},
    async message(source, data, origin = location.origin) {for (const fn of windowEvents.get('message') || []) await fn({source, data, origin}); await flush();}
  };
}

test('app real inicia com as extensões, lojas, lançador e sincronização da produção', () => {
  const h = createHarness();
  assert.ok(h.A); assert.equal(h.A.route, 'inicio'); assert.equal(h.A.state.stores.length, 3);
  assert.match(h.markup, /Seu negócio, em movimento/); assert.match(h.markup, /x-dashboard-filter/);
  assert.ok(h.document.getElementById('environment-launcher'));
  const bridge = h.document.getElementById('production-bootstrap');
  assert.ok(bridge); assert.match(bridge.src, /readonly=1/);
  const sidebar = h.document.getElementById('sidebar').innerHTML;
  assert.doesNotMatch(sidebar, /href="#(?:pdv|loja)"/);
  assert.deepEqual(h.errors, []);
});
test('ponte real da produção importa uma única vez, responde confirmação e rejeita outra origem', async () => {
  const h=createHarness(), bridge=h.document.getElementById('production-bootstrap');
  const payload={app:'carola-production',schema:1,materials:[],materialEntries:[],pieces:[{id:'SMOKE-PIECE',ref:'SMOKE-REF',name:'Peça integrada',color:'Oliva',category:'Vestido',collection:'Smoke',lot:'SMOKE-LOT',stage:11,finished:true,grade:[{size:'M',qty:5}],due:h.A.F.today}],stockEntries:[{id:'SMOKE-ENTRY',pieceId:'SMOKE-PIECE',ref:'SMOKE-REF',name:'Peça integrada',color:'Oliva',date:h.A.F.today,approval:'Aprovado com observação',rows:[{size:'M',normal:3,second:1,rejected:1}]}]};
  await h.message(bridge.contentWindow,{type:'carola-production-state',state:payload},'https://outra-origem.exemplo');
  assert.equal(h.A.state.products.some(p=>p.sourceRef==='SMOKE-REF'),false);
  await h.message(bridge.contentWindow,{type:'carola-production-state',state:payload});
  const variants=h.A.state.products.filter(p=>p.sourceRef==='SMOKE-REF');
  assert.equal(variants.length,2); assert.equal(variants.reduce((n,p)=>n+h.A.F.at(h.A.state,p.id,'fab'),0),4);
  const moves=h.A.state.moves.length;
  await h.message(bridge.contentWindow,{type:'carola-production-state',state:payload});
  assert.equal(h.A.state.moves.length,moves);
  const ack=bridge.contentWindow.messages.findLast(item=>item.message.type==='carola-production-ack');
  assert.ok(ack); assert.ok(ack.message.ids.includes('SMOKE-ENTRY'));
  assert.deepEqual(h.errors,[]);
});
test('cinco áreas principais renderizam usando as views reais sem erro de contrato', () => {
  const h = createHarness();
  for (const [route, expected] of [['inicio', /Vendas no período/], ['catalogo', /Saldos, entradas e saídas/], ['relatorios', /Estoque por período/], ['metas', /COMPOSIÇÃO DA META/], ['usuarios', /ANIVERSARIANTES DO MÊS/]]) {
    h.A.go(route); assert.equal(h.A.route, route); assert.match(h.markup, expected, route); assert.doesNotMatch(h.markup, /access-denied/);
  }
  assert.deepEqual(h.errors, []);
});
test('trocar unidade e usuário por eventos reais mantém filtros em unidade autorizada', async () => {
  const h = createHarness();
  await h.change(h.document.getElementById('demo-unit'), 'mar');
  assert.equal(h.A.state.unit, 'mar');
  assert.equal(h.context.CarolaWorkspace.dashboard.unit, 'mar');
  assert.equal(h.context.CarolaWorkspace.report.unit, 'mar');
  assert.equal(h.context.CarolaWorkspace.goal.unit, 'mar');
  // Um administrador pode consultar outra unidade sem mudar sua unidade da sessão.
  await h.submit(h.document.querySelector('[data-form="x-dashboard-filter"]'), {from: h.A.F.month, to: h.A.F.today, unit: 'fab', preset: 'custom'});
  assert.equal(h.context.CarolaWorkspace.dashboard.unit, 'fab');
  // Ana segue na unidade Maringá; a troca de usuário deve remover o filtro inacessível da fábrica.
  await h.change(h.document.getElementById('demo-user'), 'ana');
  assert.equal(h.A.state.user, 'ana'); assert.equal(h.A.state.unit, 'mar');
  assert.equal(h.context.CarolaWorkspace.dashboard.unit, 'mar');
  assert.match(h.markup, /Vendas no período/); assert.doesNotMatch(h.markup, /não está autorizada/);
  assert.deepEqual(h.errors, []);
});
test('relatório clientes atribui devolução de venda anterior ao cliente e à cidade corretos', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  s.orders = []; s.returns = []; s.titles = []; s.notes = [];
  const order = F.sell(s, {unit: 'fab', client: 'Cliente com devolução', clientCity: 'Campinas', clientState: 'SP', method: 'Pix', items: [{product: 'p1', qty: 2}]});
  order.date = F.offset(-3);
  F.returnSale(s, order.id, 'p1', 1, 'Troca solicitada hoje');
  h.A.go('relatorios');
  await h.submit(h.document.querySelector('[data-form="x-report-filter"]'), {from: F.today, to: F.today, unit: 'fab', kind: '', product: ''});
  h.E.actions['x-report-kind']('clientes');
  const report = h.context.CarolaWorkspace.getReport();
  const row = report.rows.find(row => row[0] === 'Cliente com devolução');
  assert.ok(row, 'A devolução de uma venda anterior deve aparecer no relatório do cliente.');
  assert.equal(row[1], 'SP'); assert.equal(row[2], 'Campinas'); assert.equal(row[4], 0); assert.equal(row[5], -289);
  assert.match(h.markup, /Cliente com devolução/); assert.deepEqual(h.errors, []);
});
test('somente visualizar mantém filtros e prévias operantes e desabilita ações de alteração', async () => {
  const h = createHarness(), s = h.A.state;
  s.users.push({id: 'readonly', name: 'Consulta', role: 'Consulta', active: true, email: 'consulta@exemplo.test', units: ['fab'], permissions: Object.fromEntries(h.A.F.modules.map(m => [m, {view: true, edit: false, export: false}]))});
  await h.change(h.document.getElementById('demo-user'), 'readonly');
  const dashboardForm = h.document.querySelector('[data-form="x-dashboard-filter"]');
  assert.equal(dashboardForm.querySelector('[type="submit"]').disabled, false);
  await h.submit(dashboardForm, {from: h.A.F.offset(-2), to: h.A.F.today, unit: 'fab', preset: 'custom'});
  assert.equal(h.context.CarolaWorkspace.dashboard.from, h.A.F.offset(-2));
  h.A.go('relatorios');
  assert.equal(h.document.querySelector('[data-action="x-report-kind"]').disabled, false);
  const reportForm = h.document.querySelector('[data-form="x-report-filter"]');
  assert.equal(reportForm.querySelector('[type="submit"]').disabled, false);
  await h.submit(reportForm, {from: h.A.F.today, to: h.A.F.today, unit: 'fab', kind: 'acabado', product: ''});
  assert.equal(h.context.CarolaWorkspace.report.from, h.A.F.today);
  h.A.go('metas');
  assert.equal(h.document.querySelector('[data-form="x-goal-preview"] [type="submit"]').disabled, false);
  assert.equal(h.document.querySelector('[data-action="x-goal-save"]').disabled, true);
  h.A.go('usuarios');
  assert.equal(h.document.querySelector('[data-action="user-new"]').disabled, true);
  assert.deepEqual(h.errors, []);
});
test('módulos comerciais e módulos mantidos renderizam na mesma aplicação', () => {
  const h = createHarness();
  for (const route of ['lojas', 'pdv', 'loja', 'pedidos', 'consignacoes', 'caixa', 'financeiro', 'fiscal', 'cadastros', 'cheques', 'ponto', 'config']) {
    h.A.go(route); assert.equal(h.A.route, route); assert.ok(h.markup.length > 200, route); assert.doesNotMatch(h.markup, /access-denied/, route);
  }
  assert.deepEqual(h.errors, []);
});
test('login e checkout PDV atravessam formulários reais, loja, caixa, estoque e financeiro', async () => {
  const h = createHarness(); h.A.go('pdv');
  await h.submit(h.document.querySelector('[data-form="x-pos-login"]'), {storeId: 'store-mar', login: 'gerente', password: 'gerente123'});
  assert.equal(h.context.CarolaCommerce.currentSession().unit, 'mar');
  const count = h.A.state.orders.length, stock = h.A.F.at(h.A.state, 'p1', 'mar');
  const card = h.document.querySelector('[data-action="x-pos-add"][data-id="p1"]');
  assert.ok(card, 'A loja precisa exibir a variante com saldo para venda.');
  await h.click(card);
  const checkout = h.document.querySelector('[data-form="x-pos-checkout"]');
  await h.submit(checkout, {client: 'Cliente do smoke', clientCity: 'Londrina', clientState: 'PR', method: 'Pix', installments: 1, discount: 0});
  const order = h.A.state.orders.find(o => o.client === 'Cliente do smoke');
  assert.ok(order); assert.equal(order.unit, 'mar'); assert.equal(order.storeId, 'store-mar');
  assert.equal(h.A.state.orders.length, count + 1); assert.equal(h.A.F.at(h.A.state, 'p1', 'mar'), stock - 1);
  assert.equal(h.A.state.titles.filter(t => t.orderId === order.id).length, 1);
  assert.equal(h.document.getElementById('dialog').open, true); assert.deepEqual(h.errors, []);
});

function attachBackupStore(h, initial) {
  const data = new Map([['main', initial]]), blobs = [];
  h.context.URL = {createObjectURL(blob) {blobs.push(blob); return 'blob:backup-test';}, revokeObjectURL() {}};
  h.context.indexedDB = {open(name) {assert.equal(name,'carola-production-integrado-v1');const request = {}; setImmediate(() => {
    request.result = {objectStoreNames: {contains: () => true}, close() {}, transaction() {
      const tx = {objectStore() {return {
        get(key) {const q = {}; setImmediate(() => {q.result = data.get(key); q.onsuccess?.(); tx.oncomplete?.();}); return q;},
        put(value, key) {data.set(key, value); setImmediate(() => tx.oncomplete?.());},
        delete(key) {data.delete(key); setImmediate(() => tx.oncomplete?.());}
      };}}; return tx;
    }}; request.onsuccess?.();
  }); return request;}};
  return {data, blobs};
}

test('backup integrado exporta gestão e anexos e restaura as duas bases após confirmação', async () => {
  const h = createHarness(); h.A.go('config');
  const production = {app: 'carola-production', schema: 1, pieces: [{id: 'p-backup', files: [{data: 'data:text/plain;base64,YW5leG8='}]}], stockEntries: []};
  const db = attachBackupStore(h, production);
  await h.E.actions.backup();
  const file = JSON.parse(await db.blobs[0].text());
  assert.equal(file.app, 'carola-integrado'); assert.equal(file.management.settings.company, h.A.state.settings.company);
  assert.equal(file.production.pieces[0].files[0].data, 'data:text/plain;base64,YW5leG8=');
  file.management.settings.company = 'By Carola restaurada';
  const serialized = JSON.stringify(file), input = h.document.getElementById('restore-integrated');
  input.files = [{name: 'backup.json', size: serialized.length, text: async () => serialized}];
  await h.change(input, '');
  assert.notEqual(h.A.state.settings.company, 'By Carola restaurada', 'Restaurar deve aguardar confirmação.');
  assert.equal(h.document.getElementById('dialog').open, true);
  await h.E.actions['x-confirm-integrated-restore']();
  assert.equal(h.A.state.settings.company, 'By Carola restaurada');
  assert.equal(db.data.get('main').pieces[0].id, 'p-backup');
  assert.deepEqual(h.errors, []);
});

test('cancelar nota preserva estoque e retorna situação fiscal para faturamento', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const order = F.sell(s, {unit: 'fab', client: 'Cliente nota', items: [{product: 'p1', qty: 1}], channel: 'Loja física', method: 'Pix'});
  const note = F.issueNote(s, order.id), stock = F.at(s, 'p1', 'fab'), titles = s.titles.length;
  await h.E.forms['note-cancel']({}, {reason: 'Correção demonstrativa da nota'}, note.id);
  assert.equal(note.status, 'Cancelada'); assert.equal(order.billingStatus, 'Faturamento');
  assert.equal(order.status, 'Faturamento'); assert.equal(F.at(s, 'p1', 'fab'), stock); assert.equal(s.titles.length, titles);
  assert.equal(order.statusHistory.at(-1).text.includes('Correção demonstrativa'), true);
});

test('gráfico mantém valores negativos de devolução dentro da área visível', () => {
  const h = createHarness();
  for(const values of [[-289,-90],[-289,0,379],[0,0]]) {
    const svg=h.A.lineChart(values,values.map((_,i)=>String(i)));
    const points=svg.match(/<polyline points="([^"]+)"/)[1].split(' ').map(pair=>pair.split(',').map(Number));
    assert.equal(points.length,values.length);
    points.forEach(([x,y])=>{assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(y>=0&&y<=205)});
  }
});

async function closeCashViaForm(h, cashId, {counted, note = 'Conferência realizada no teste de integração'} = {}) {
  h.A.go('caixa');
  if (h.context.CarolaCashHistoryUI.filters.view !== 'current') h.E.actions['x-cash-current']();
  const cash = h.A.state.cash.find(item => item.id === cashId), session = cash.session;
  const closeButton = h.document.querySelector(`[data-action="cash-close"][data-id="${cashId}"]`);
  assert.ok(closeButton, 'O caixa aberto precisa oferecer a ação de fechamento.');
  await h.click(closeButton);
  const form = h.document.querySelector(`[data-form="cash-close:${cashId}"]`);
  assert.ok(form, 'O formulário real de conferência precisa ser aberto.');
  const amount = counted ?? h.A.F.cashExpected(h.A.state, cashId);
  await h.submit(form, {counted: amount, note});
  assert.equal(h.A.state.cash.find(item => item.id === cashId).open, false);
  const snapshot = h.A.state.cashClosings.find(item => item.cashId === cashId && item.session === session);
  assert.ok(snapshot, 'Submeter a conferência deve preservar um fechamento da sessão.');
  return snapshot;
}

test('formulários de caixa preservam a primeira conferência após reabrir, vender e fechar novamente', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const cash = s.cash.find(item => item.unit === 'fab' && item.open);
  const initialExpected = F.cashExpected(s, cash.id);
  const first = await closeCashViaForm(h, cash.id, {counted: initialExpected + 5, note: 'Sobra de cinco reais conferida'});
  assert.equal(first.expected, initialExpected);
  assert.equal(first.counted, initialExpected + 5);
  assert.equal(first.difference, 5);
  assert.equal(first.closedByName, F.user(s).name);
  const original = JSON.stringify(first);

  const openButton = h.document.querySelector(`[data-action="cash-open"][data-id="${cash.id}"]`);
  assert.ok(openButton);
  await h.click(openButton);
  const openForm = h.document.querySelector(`[data-form="cash-open:${cash.id}"]`);
  assert.ok(openForm);
  await h.submit(openForm, {opening: 75});
  assert.equal(cash.open, true);
  assert.equal(cash.opening, 75);
  assert.notEqual(cash.session, first.session);
  const newOrder = F.sell(s, {unit: 'fab', client: 'Cliente da nova sessão de caixa', items: [{product: 'p1', qty: 1}], method: 'Dinheiro', channel: 'Loja física', cashId: cash.id, cashSession: cash.session});
  const second = await closeCashViaForm(h, cash.id);
  assert.equal(second.expected, 75 + newOrder.total);
  assert.equal(second.counted, second.expected);
  assert.equal(second.difference, 0);
  assert.ok(second.sales.some(order => order.id === newOrder.id));
  assert.equal(first.sales.some(order => order.id === newOrder.id), false);
  assert.equal(s.cashClosings.filter(item => item.cashId === cash.id).length, 2);
  assert.equal(JSON.stringify(s.cashClosings.find(item => item.id === first.id)), original);

  await h.click(h.document.querySelector('[data-action="x-cash-closed"]'));
  const detail = h.document.querySelector(`[data-action="x-cash-closing"][data-id="${first.id}"]`);
  assert.ok(detail, 'A conferência anterior deve continuar consultável.');
  await h.click(detail);
  const markup = h.document.getElementById('dialog-content').innerHTML;
  assert.match(markup, /Responsável/);
  assert.match(markup, /Dinheiro esperado/);
  assert.match(markup, /Dinheiro conferido/);
  assert.ok(markup.includes(first.closedByName));
  assert.ok(markup.includes(h.A.brl(first.expected)));
  assert.ok(markup.includes(h.A.brl(first.counted)));
  assert.match(markup, /Sobra de cinco reais conferida/);
  assert.deepEqual(h.errors, []);
});

test('consulta de fechamentos respeita datas inicial e final inclusivas no formulário real', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const cash = s.cash.find(item => item.unit === 'fab' && item.open);
  const current = await closeCashViaForm(h, cash.id);
  const oldDate = F.offset(-6), older = JSON.parse(JSON.stringify(current));
  Object.assign(older, {id: 'FECHAMENTO-ANTERIOR-TESTE', session: 'SESSAO-ANTERIOR-TESTE', closedDate: oldDate, closedAt: oldDate + 'T16:00:00.000Z', note: 'Conferência anterior para o filtro de datas'});
  s.cashClosings.push(older);
  await h.click(h.document.querySelector('[data-action="x-cash-closed"]'));
  await h.submit(h.document.querySelector('[data-form="x-cash-history-filter"]'), {from: oldDate, to: oldDate, cashId: cash.id});
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, older.id);
  assert.ok(h.markup.includes(`data-id="${older.id}"`));
  assert.ok(!h.markup.includes(`data-id="${current.id}"`));

  await h.submit(h.document.querySelector('[data-form="x-cash-history-filter"]'), {from: F.today, to: F.today, cashId: cash.id});
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, current.id);
  await h.submit(h.document.querySelector('[data-form="x-cash-history-filter"]'), {from: oldDate, to: F.today, cashId: cash.id});
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 2);
  assert.ok(h.context.CarolaCashHistoryUI.rows.some(item => item.id === older.id));
  assert.ok(h.context.CarolaCashHistoryUI.rows.some(item => item.id === current.id));
  assert.deepEqual(h.errors, []);
});

test('somente visualizar permite consultar datas e detalhes de fechamentos sem operar o caixa', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const cash = s.cash.find(item => item.unit === 'fab' && item.open);
  const snapshot = await closeCashViaForm(h, cash.id);
  s.users.push({id: 'cash-readonly', name: 'Consulta de caixas', role: 'Consulta', active: true, email: 'caixas-consulta@exemplo.test', units: ['fab'], permissions: Object.fromEntries(F.modules.map(module => [module, {view: true, edit: false, export: false}]))});
  await h.change(h.document.getElementById('demo-user'), 'cash-readonly');
  h.A.go('caixa');
  assert.equal(h.document.querySelector('[data-action="cash-new"]').disabled, true);
  assert.equal(h.document.querySelector(`[data-action="cash-open"][data-id="${cash.id}"]`).disabled, true);
  const historyButton = h.document.querySelector('[data-action="x-cash-closed"]');
  assert.equal(historyButton.disabled, false);
  await h.click(historyButton);
  const filter = h.document.querySelector('[data-form="x-cash-history-filter"]');
  assert.equal(filter.querySelector('[type="submit"]').disabled, false);
  await h.submit(filter, {from: F.today, to: F.today, cashId: cash.id});
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  const detail = h.document.querySelector(`[data-action="x-cash-closing"][data-id="${snapshot.id}"]`);
  assert.equal(detail.disabled, false);
  await h.click(detail);
  assert.equal(h.document.getElementById('dialog').open, true);
  assert.match(h.document.getElementById('dialog-content').innerHTML, /Dinheiro conferido/);
  assert.equal(s.cashClosings.length, 1);
  assert.deepEqual(h.errors, []);
});

test('seletor de unidade isola fechamentos e limpa a seleção anterior de caixa', async () => {
  const h = createHarness(), s = h.A.state;
  const factoryCash = s.cash.find(item => item.unit === 'fab' && item.open);
  const factoryClosing = await closeCashViaForm(h, factoryCash.id);
  await h.click(h.document.querySelector(`[data-action="cash-history"][data-id="${factoryCash.id}"]`));
  assert.equal(h.context.CarolaCashHistoryUI.filters.cashId, factoryCash.id);
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);

  await h.change(h.document.getElementById('demo-unit'), 'mar');
  assert.equal(s.unit, 'mar');
  assert.equal(h.context.CarolaCashHistoryUI.filters.cashId, '');
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 0);
  const storeCash = s.cash.find(item => item.unit === 'mar' && item.open);
  const storeClosing = await closeCashViaForm(h, storeCash.id);
  await h.click(h.document.querySelector('[data-action="x-cash-closed"]'));
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, storeClosing.id);
  assert.ok(!h.markup.includes(`data-id="${factoryClosing.id}"`));
  await h.change(h.document.getElementById('demo-unit'), 'fab');
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, factoryClosing.id);
  assert.ok(!h.markup.includes(`data-id="${storeClosing.id}"`));
  assert.deepEqual(h.errors, []);
});

test('histórico no cartão do caixa seleciona somente as conferências daquele caixa', async () => {
  const h = createHarness(), s = h.A.state;
  const firstCash = s.cash.find(item => item.unit === 'fab' && item.open);
  const extra = JSON.parse(JSON.stringify(firstCash));
  Object.assign(extra, {id: 'CX-SEGUNDO-TESTE', name: 'Segundo caixa da fábrica para teste', session: 'SESSAO-SEGUNDO-TESTE', opening: 50, counted: null, difference: null, history: []});
  s.cash.push(extra);
  const firstClosing = await closeCashViaForm(h, firstCash.id);
  const extraClosing = await closeCashViaForm(h, extra.id);
  const cardHistory = h.document.querySelector(`[data-action="cash-history"][data-id="${firstCash.id}"]`);
  assert.ok(cardHistory);
  await h.click(cardHistory);
  assert.equal(h.context.CarolaCashHistoryUI.filters.view, 'closed');
  assert.equal(h.context.CarolaCashHistoryUI.filters.cashId, firstCash.id);
  assert.equal(h.document.querySelector('[data-form="x-cash-history-filter"]').elements.cashId.value, firstCash.id);
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, firstClosing.id);
  assert.ok(!h.markup.includes(`data-id="${extraClosing.id}"`));
  await h.click(h.document.querySelector('[data-action="x-cash-current"]'));
  await h.click(h.document.querySelector(`[data-action="cash-history"][data-id="${extra.id}"]`));
  assert.equal(h.context.CarolaCashHistoryUI.filters.cashId, extra.id);
  assert.equal(h.context.CarolaCashHistoryUI.rows.length, 1);
  assert.equal(h.context.CarolaCashHistoryUI.rows[0].id, extraClosing.id);
  assert.deepEqual(h.errors, []);
});

function checkSaveForm(h, id = '') {
  return h.document.querySelector(id ? `[data-form="x-check-save:${id}"]` : '[data-form="x-check-save"], [data-form="x-check-save:"]');
}

async function registerCheckViaForm(h, values = {}) {
  h.A.go('cheques');
  const create = h.document.querySelector('[data-action="check-new"]');
  assert.ok(create, 'O cadastro de cheques deve oferecer a criação de um registro.');
  await h.click(create);
  let form = checkSaveForm(h);
  assert.ok(form, 'A criação deve abrir o formulário real de cheque.');
  const fields = {person: 'Emitente independente do representante', number: '000987', bank: 'Banco do teste', amount: 342.5, due: h.A.F.today, receivedDate: h.A.F.today, representativeId: 'ct2', consignmentId: 'ROM-0101', note: 'Recebido no acerto do representante', ...values};
  if (fields.representativeId) {
    await h.change(form.elements.representativeId, fields.representativeId);
    form = checkSaveForm(h);
  }
  if (fields.consignmentId) assert.ok(form.elements.consignmentId.querySelector(`[value="${fields.consignmentId}"]`), 'O romaneio compatível precisa estar disponível no formulário.');
  await h.submit(form, fields);
  const check = h.A.state.checks.find(item => item.number === String(fields.number));
  assert.ok(check, 'Submeter o formulário deve cadastrar o cheque.');
  return check;
}

async function changeCheckStatusViaForm(h, id, status, note) {
  h.A.go('cheques');
  h.E.actions['check-state'](id);
  const form = h.document.querySelector(`[data-form="x-check-status:${id}"]`);
  assert.ok(form, 'A atualização deve abrir o formulário real de situação.');
  await h.submit(form, {status, note});
  assert.equal(h.A.state.checks.find(check => check.id === id).status, status);
}

test('cheque recebido do representante mantém emitente próprio, vínculo e histórico com autor e data', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const check = await registerCheckViaForm(h);
  assert.equal(check.person, 'Emitente independente do representante');
  assert.equal(check.representativeId, 'ct2');
  assert.equal(check.consignmentId, 'ROM-0101');
  assert.equal(check.unit, 'fab');
  assert.equal(check.amount, 342.5);
  assert.equal(check.receivedDate, F.today);
  assert.equal(check.status, 'Em carteira');
  assert.notEqual(check.person, s.contacts.find(contact => contact.id === 'ct2').name);
  assert.ok(h.markup.includes(check.person));
  const expectedStatuses = ['Em carteira', 'Depositado', 'Compensado', 'Substituído', 'Cancelado', 'Descontado'];
  const filter = h.document.querySelector('[data-form="x-check-filter"]');
  assert.ok(filter);
  assert.deepEqual(Array.from(filter.elements.status.querySelectorAll('option'), option => option.value).filter(Boolean), expectedStatuses);

  h.E.actions['check-state'](check.id);
  const statusForm = h.document.querySelector(`[data-form="x-check-status:${check.id}"]`);
  assert.deepEqual(Array.from(statusForm.elements.status.querySelectorAll('option'), option => option.value), expectedStatuses);
  const before = check.history.length;
  await h.submit(statusForm, {status: 'Depositado', note: 'Depositado pelo responsável no teste'});
  const updated = s.checks.find(item => item.id === check.id);
  assert.equal(updated.status, 'Depositado');
  assert.equal(updated.history.length, before + 1);
  const event = updated.history.find(item => item.status === 'Depositado' && item.note === 'Depositado pelo responsável no teste');
  assert.ok(event);
  assert.equal(event.date, F.today);
  assert.ok(JSON.stringify(event).includes(F.user(s).name), 'O histórico precisa identificar o autor da atualização.');
  h.E.actions['check-history'](check.id);
  const detail = h.document.getElementById('dialog-content').innerHTML;
  assert.ok(detail.includes(check.person));
  assert.ok(detail.includes(s.contacts.find(contact => contact.id === 'ct2').name));
  assert.ok(detail.includes('ROM-0101'));
  assert.ok(detail.includes('Depositado pelo responsável no teste'));
  assert.deepEqual(h.errors, []);
});

test('editar cheque legado vincula representante e romaneio sem perder dados anteriores', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const legacy = s.checks.find(check => check.id === 'CH-451');
  assert.ok(legacy);
  legacy.history.push({date: F.offset(-3), status: legacy.status, note: 'Registro anterior preservado'});
  legacy.photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxbkAAAAASUVORK5CYII=';
  h.A.go('cheques');
  const old = JSON.parse(JSON.stringify(legacy));
  const edit = h.document.querySelector(`[data-action="x-check-edit"][data-id="${legacy.id}"]`);
  assert.ok(edit);
  await h.click(edit);
  let form = checkSaveForm(h, legacy.id);
  assert.ok(form);
  await h.change(form.elements.representativeId, 'ct2');
  form = checkSaveForm(h, legacy.id);
  await h.submit(form, {representativeId: 'ct2', consignmentId: 'ROM-0101', note: 'Vínculo conferido depois do cadastro'});
  const updated = s.checks.find(check => check.id === legacy.id);
  for (const field of ['person', 'number', 'bank', 'amount', 'due', 'status', 'photo']) assert.equal(updated[field], old[field], field);
  assert.equal(updated.representativeId, 'ct2');
  assert.equal(updated.consignmentId, 'ROM-0101');
  assert.ok(updated.history.length > old.history.length);
  for (const event of old.history) assert.ok(updated.history.some(item => item.date === event.date && item.status === event.status && item.note === event.note), 'O evento anterior precisa continuar no histórico.');
  assert.deepEqual(h.errors, []);
});

test('consulta de cheques combina situação, representante e datas inclusivas de vencimento ou recebimento', async () => {
  const h = createHarness(), F = h.A.F;
  const first = await registerCheckViaForm(h, {number: '000991', person: 'Emitente da data inicial', due: F.offset(-3), receivedDate: F.offset(-5)});
  const second = await registerCheckViaForm(h, {number: '000992', person: 'Emitente da data final', due: F.today, receivedDate: F.today});
  const third = await registerCheckViaForm(h, {number: '000993', person: 'Emitente de outro representante', representativeId: 'ct3', consignmentId: '', due: F.today, receivedDate: F.today});
  await changeCheckStatusViaForm(h, first.id, 'Depositado', 'Situação usada no filtro');
  let form = h.document.querySelector('[data-form="x-check-filter"]');
  await h.submit(form, {q: 'Emitente da data inicial', status: 'Depositado', representativeId: 'ct2', dateField: 'due', from: first.due, to: first.due});
  assert.equal(h.context.CarolaChecksUI.rows.length, 1);
  assert.equal(h.context.CarolaChecksUI.rows[0].id, first.id);
  form = h.document.querySelector('[data-form="x-check-filter"]');
  await h.submit(form, {q: '', status: '', representativeId: 'ct2', dateField: 'due', from: first.due, to: second.due});
  assert.equal(h.context.CarolaChecksUI.rows.length, 2);
  assert.ok(h.context.CarolaChecksUI.rows.some(check => check.id === first.id));
  assert.ok(h.context.CarolaChecksUI.rows.some(check => check.id === second.id));
  assert.equal(h.context.CarolaChecksUI.rows.some(check => check.id === third.id), false);
  form = h.document.querySelector('[data-form="x-check-filter"]');
  await h.submit(form, {q: '', status: '', representativeId: 'ct2', dateField: 'receivedDate', from: first.receivedDate, to: first.receivedDate});
  assert.equal(h.context.CarolaChecksUI.rows.length, 1);
  assert.equal(h.context.CarolaChecksUI.rows[0].id, first.id);
  assert.deepEqual(h.errors, []);
});

test('somente visualizar permite filtros e detalhes de cheques e bloqueia cadastro e edição', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const check = await registerCheckViaForm(h, {number: '000994'});
  s.users.push({id: 'checks-readonly', name: 'Consulta de cheques', role: 'Consulta', active: true, email: 'cheques-consulta@exemplo.test', units: ['fab'], permissions: Object.fromEntries(F.modules.map(module => [module, {view: true, edit: false, export: false}]))});
  await h.change(h.document.getElementById('demo-user'), 'checks-readonly');
  h.A.go('cheques');
  assert.equal(h.document.querySelector('[data-action="check-new"]').disabled, true);
  const edit = h.document.querySelector(`[data-action="x-check-edit"][data-id="${check.id}"]`);
  const changeStatus = h.document.querySelector(`[data-action="check-state"][data-id="${check.id}"]`);
  assert.ok(!edit || edit.disabled, 'A edição deve estar ausente ou desabilitada para consulta.');
  assert.ok(!changeStatus || changeStatus.disabled, 'A alteração de situação deve estar ausente ou desabilitada para consulta.');
  const form = h.document.querySelector('[data-form="x-check-filter"]');
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  await h.submit(form, {q: check.number, status: 'Em carteira', representativeId: 'ct2', dateField: 'due', from: F.today, to: F.today});
  assert.equal(h.context.CarolaChecksUI.rows.length, 1);
  const detail = h.document.querySelector(`[data-action="x-check-detail"][data-id="${check.id}"]`) || h.document.querySelector(`[data-action="check-history"][data-id="${check.id}"]`);
  assert.ok(detail);
  assert.equal(detail.disabled, false);
  await h.click(detail);
  assert.equal(h.document.getElementById('dialog').open, true);
  assert.ok(h.document.getElementById('dialog-content').innerHTML.includes(check.person));
  assert.deepEqual(h.errors, []);
});

test('seletor de unidade isola o registro de cheques e seus filtros', async () => {
  const h = createHarness(), s = h.A.state;
  const factory = await registerCheckViaForm(h, {number: '000995'});
  await h.change(h.document.getElementById('demo-unit'), 'mar');
  assert.equal(s.unit, 'mar');
  assert.equal(h.context.CarolaChecksUI.rows.some(check => check.id === factory.id), false);
  const shop = await registerCheckViaForm(h, {number: '000996', person: 'Emitente da loja de Maringá', representativeId: '', consignmentId: ''});
  assert.equal(shop.unit, 'mar');
  assert.ok(h.context.CarolaChecksUI.rows.some(check => check.id === shop.id));
  assert.equal(h.context.CarolaChecksUI.rows.some(check => check.id === factory.id), false);
  await h.change(h.document.getElementById('demo-unit'), 'fab');
  assert.ok(h.context.CarolaChecksUI.rows.some(check => check.id === factory.id));
  assert.equal(h.context.CarolaChecksUI.rows.some(check => check.id === shop.id), false);
  assert.deepEqual(h.errors, []);
});

test('vínculo de cheque rejeita romaneio de outro representante ou unidade sem mutação', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const original = s.consignments.find(rom => rom.id === 'ROM-0101');
  s.consignments.push({...JSON.parse(JSON.stringify(original)), id: 'ROM-OUTRO-REP-TESTE', rep: 'ct3'});
  s.consignments.push({...JSON.parse(JSON.stringify(original)), id: 'ROM-OUTRA-UNIDADE-TESTE', unit: 'mar'});
  h.A.go('cheques');
  await h.click(h.document.querySelector('[data-action="check-new"]'));
  let form = checkSaveForm(h);
  await h.change(form.elements.representativeId, 'ct2');
  form = checkSaveForm(h);
  assert.equal(form.elements.consignmentId.querySelector('[value="ROM-OUTRO-REP-TESTE"]'), null);
  assert.equal(form.elements.consignmentId.querySelector('[value="ROM-OUTRA-UNIDADE-TESTE"]'), null);
  const before = JSON.stringify(s);
  for (const incompatible of ['ROM-OUTRO-REP-TESTE', 'ROM-OUTRA-UNIDADE-TESTE']) {
    await h.submit(form, {person: 'Emitente do vínculo inválido', number: '000997', bank: 'Banco do teste', amount: 90, due: F.today, receivedDate: F.today, representativeId: 'ct2', consignmentId: incompatible, note: 'Não deve ser salvo'});
    assert.equal(JSON.stringify(s), before, 'Falha de vínculo não pode cadastrar cheque, histórico ou outro dado.');
    assert.match(form.querySelector('.form-error').textContent, /romaneio|representante|unidade/i);
  }
  assert.equal(s.checks.some(check => check.number === '000997'), false);
  assert.deepEqual(h.errors, []);
});

function stockDemo(h) {
  const demo = h.A.state.products.find(product => product.sourceDemoStockAlert);
  assert.ok(demo, 'A base deve disponibilizar uma peça separada para demonstrar o alerta.');
  return demo;
}

function assertStockCardFlag(h, productId, expected) {
  const movement = h.document.querySelector(`[data-action="move"][data-id="${productId}"]`);
  assert.ok(movement, 'A variante precisa estar visível no catálogo.');
  const card = movement.closest('article');
  assert.ok(card);
  const flag = card.querySelector('.stock-low-flag');
  assert.equal(!!flag, expected);
  assert.equal(card.classList.contains('stock-low-card'), expected);
  if (flag) {
    assert.equal(flag.classList.contains('badge'), true);
    assert.equal(flag.classList.contains('amber'), true);
  }
}

function dashboardLowStockCount(h) {
  h.A.go('inicio');
  const match = h.markup.match(/<div class="stat-label">Estoque baixo<\/div><div class="stat-value[^"]*">(\d+)<\/div>/);
  assert.ok(match, 'O painel deve mostrar o indicador de estoque baixo.');
  return Number(match[1]);
}

async function showStockProducts(h) {
  h.A.go('catalogo');
  if (h.A.tab.catalogo !== 'produtos') await h.click(h.document.querySelector('[data-action="tab"][data-id="produtos"]'));
}

async function moveStockViaForm(h, productId, type, qty) {
  await showStockProducts(h);
  await h.click(h.document.querySelector(`[data-action="move"][data-id="${productId}"]`));
  const form = h.document.querySelector('[data-form="move"]');
  assert.ok(form, 'O botão de movimentação precisa abrir o formulário real.');
  await h.submit(form, {product: productId, loc: 'fab', type, qty, ref: 'ALERTA-ESTOQUE-TESTE', reason: type === 'in' ? 'Reposição conferida no teste' : 'Saída conferida no teste'});
}

test('peça demonstrativa com dez unidades exibe flag amarela e aparece na aba de estoque baixo', async () => {
  const h = createHarness(), s = h.A.state, alerts = h.context.CarolaStockAlerts, demo = stockDemo(h);
  assert.equal(alerts.available(s, demo.id, 'fab'), 10);
  assert.equal(alerts.isLow(s, demo, 'fab'), true);
  assert.equal(s.integration.stockAlertDemo, 1);
  assert.ok(dashboardLowStockCount(h) >= 1);
  await showStockProducts(h);
  assertStockCardFlag(h, demo.id, true);
  const cardMarkup = h.A.catalogCards([demo]);
  assert.match(cardMarkup, /Estoque disponível/);
  assert.match(cardMarkup, /Estoque baixo/);
  assert.match(cardMarkup, /10 peça/);
  const openLow = h.document.querySelector('[data-action="x-stock-low"]');
  assert.ok(openLow);
  await h.click(openLow);
  assert.equal(h.A.tab.catalogo, 'baixo');
  assertStockCardFlag(h, demo.id, true);
  assert.deepEqual(h.errors, []);
});

test('reposição e saída pelo formulário reconciliam alerta, aba e painel nos saldos onze, dez e nove', async () => {
  const h = createHarness(), s = h.A.state, alerts = h.context.CarolaStockAlerts, demo = stockDemo(h);
  const initialCount = dashboardLowStockCount(h);
  await moveStockViaForm(h, demo.id, 'in', 1);
  assert.equal(alerts.available(s, demo.id, 'fab'), 11);
  assert.equal(alerts.isLow(s, demo, 'fab'), false);
  assertStockCardFlag(h, demo.id, false);
  await h.click(h.document.querySelector('[data-action="tab"][data-id="baixo"]'));
  assert.equal(h.document.querySelector(`[data-action="move"][data-id="${demo.id}"]`), null);
  assert.equal(dashboardLowStockCount(h), initialCount - 1);

  await moveStockViaForm(h, demo.id, 'out', 1);
  assert.equal(alerts.available(s, demo.id, 'fab'), 10);
  assert.equal(alerts.isLow(s, demo, 'fab'), true);
  assertStockCardFlag(h, demo.id, true);
  await h.click(h.document.querySelector('[data-action="tab"][data-id="baixo"]'));
  assertStockCardFlag(h, demo.id, true);
  assert.equal(dashboardLowStockCount(h), initialCount);

  await moveStockViaForm(h, demo.id, 'out', 1);
  assert.equal(alerts.available(s, demo.id, 'fab'), 9);
  assertStockCardFlag(h, demo.id, true);
  assert.equal(dashboardLowStockCount(h), initialCount);
  assert.deepEqual(h.errors, []);
});

test('alerta soma saldos físicos, mantém consignado fora do disponível e não sinaliza matéria-prima', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F, alerts = h.context.CarolaStockAlerts, demo = stockDemo(h);
  F.move(s, demo.id, 'fab', 5, 'Reposição para organizar a remessa de teste');
  F.transfer(s, demo.id, 'fab', 'rep1', 5, 'Envio consignado de teste', 'ALERTA-CONSIGNADO');
  s.locations.push({id: 'fab-extra-alert-test', unit: 'fab', type: 'acabado', name: 'Depósito físico adicional do teste'});
  F.transfer(s, demo.id, 'fab', 'fab-extra-alert-test', 4, 'Organização entre depósitos físicos', 'ALERTA-DEPOSITOS');
  assert.equal(F.at(s, demo.id, 'fab'), 6);
  assert.equal(F.at(s, demo.id, 'fab-extra-alert-test'), 4);
  assert.equal(F.at(s, demo.id, 'rep1'), 5);
  assert.equal(alerts.available(s, demo.id, 'fab'), 10);
  assert.equal(alerts.isLow(s, demo, 'fab'), true);
  await showStockProducts(h);
  assertStockCardFlag(h, demo.id, true);
  assert.match(h.A.catalogCards([demo]), /<dt>Estoque disponível<\/dt><dd>10 peça/);

  const material = s.products.find(product => product.kind === 'materia' && product.active);
  const balance = F.at(s, material.id, 'raw');
  if (balance !== 9) F.move(s, material.id, 'raw', 9 - balance, 'Balanço de matéria-prima para o teste de alerta');
  assert.equal(F.at(s, material.id, 'raw'), 9);
  assert.equal(alerts.isLow(s, material, 'fab'), false);
  assert.doesNotMatch(h.A.catalogCards([material]), /stock-low-flag|stock-low-card|Estoque baixo/);
  await h.click(h.document.querySelector('[data-action="tab"][data-id="materia"]'));
  assertStockCardFlag(h, material.id, false);
  assert.deepEqual(h.errors, []);
});

test('demonstração de estoque baixo é separada e não repõe dez unidades ao migrar dados após venda', () => {
  const h = createHarness(), s = h.A.state, F = h.A.F, C = h.context.CarolaDomain, alerts = h.context.CarolaStockAlerts, demo = stockDemo(h);
  const original = F.seed();
  C.migrate(original);
  for (const product of original.products) for (const location of original.locations) {
    assert.equal(F.at(s, product.id, location.id), F.at(original, product.id, location.id), 'A demonstração não pode reduzir o saldo de um produto existente.');
  }
  F.sell(s, {unit: 'fab', client: 'Cliente do teste de persistência', channel: 'Loja física', method: 'Pix', items: [{product: demo.id, qty: 1}]});
  assert.equal(alerts.available(s, demo.id, 'fab'), 9);
  h.A.save();
  const persisted = JSON.parse(h.context.localStorage.getItem('fluxo-moda-carola-integrado-v1'));
  const productCount = persisted.products.length, moveCount = persisted.moves.length;
  C.migrate(persisted); alerts.ensureDemo(persisted);
  C.migrate(persisted); alerts.ensureDemo(persisted);
  assert.equal(persisted.integration.stockAlertDemo, 1);
  assert.equal(persisted.products.filter(product => product.sourceDemoStockAlert).length, 1);
  assert.equal(persisted.products.length, productCount);
  assert.equal(persisted.moves.length, moveCount);
  assert.equal(alerts.available(persisted, demo.id, 'fab'), 9);
  for (const product of original.products) for (const location of original.locations) {
    assert.equal(F.at(persisted, product.id, location.id), F.at(original, product.id, location.id));
  }
  assert.deepEqual(h.errors, []);
});

function otherServiceFlowsSnapshot(state) {
  const fields = ['products', 'locations', 'moves', 'ops', 'orders', 'returns', 'consignments', 'cash', 'cashMoves', 'cashClosings', 'checks', 'targets', 'targetHistory', 'goalHistory', 'productionSnapshot', 'productionImports', 'productionEntries', 'customers', 'contacts', 'remittances', 'punches', 'numberVoids', 'stores', 'units', 'users', 'settings'];
  return JSON.stringify(Object.fromEntries(fields.map(field => [field, state[field] ?? null])));
}

async function openServiceNotes(h) {
  h.A.go('fiscal');
  const tab = h.document.querySelector('[data-action="tab"][data-id="servicos"]');
  assert.ok(tab, 'O fiscal deve oferecer a aba de notas de serviço.');
  await h.click(tab);
  assert.equal(h.A.tab.fiscal, 'servicos');
}

function serviceNoteFields(h, overrides = {}) {
  return {person: 'Prestadora de costura do teste', providerDocument: '12345678000190', reference: 'SERV-TESTE-001', series: 'A', date: h.A.F.today, amount: 625.75, description: 'Serviço de costura terceirizada', due: h.A.F.offset(12), method: 'Boleto', bank: 'Conta de serviços', notes: 'Programar o pagamento conforme combinado', ...overrides};
}

async function registerServiceNoteViaForm(h, overrides = {}) {
  await openServiceNotes(h);
  const create = h.document.querySelector('[data-action="x-service-note-new"]');
  assert.ok(create);
  await h.click(create);
  const form = h.document.querySelector('[data-form="x-service-note-register"]');
  assert.ok(form, 'A nota de serviço deve ter seu formulário próprio.');
  const values = serviceNoteFields(h, overrides);
  await h.submit(form, values);
  const note = h.A.state.notes.find(item => item.kind === 'Serviço' && item.reference === values.reference && item.person === values.person && item.unit === h.A.state.unit);
  assert.ok(note, 'A submissão do formulário deve registrar a nota de serviço.');
  const payable = h.A.state.titles.find(title => title.id === note.payableId);
  assert.ok(payable);
  return {note, payable, values};
}

test('nota de serviço pelo formulário gera somente uma conta a pagar e preserva todos os outros fluxos', async () => {
  const h = createHarness(), s = h.A.state;
  const before = otherServiceFlowsSnapshot(s), noteCount = s.notes.length, titleCount = s.titles.length;
  const {note, payable, values} = await registerServiceNoteViaForm(h);
  assert.equal(s.notes.length, noteCount + 1);
  assert.equal(s.titles.length, titleCount + 1);
  assert.equal(note.kind, 'Serviço');
  assert.equal(note.category, 'service');
  assert.equal(note.unit, 'fab');
  assert.equal(note.person, values.person);
  assert.equal(note.providerDocument, values.providerDocument);
  assert.equal(note.reference, values.reference);
  assert.equal(note.series, values.series);
  assert.equal(note.date, values.date);
  assert.equal(note.amount, values.amount);
  assert.equal(note.description, values.description);
  assert.equal(note.payableId, payable.id);
  assert.equal(payable.type, 'pagar');
  assert.equal(payable.status, 'Aberto');
  assert.equal(payable.source, 'service-note');
  assert.equal(payable.nf, note.id);
  assert.equal(payable.unit, 'fab');
  assert.equal(payable.person, values.person);
  assert.equal(payable.amount, values.amount);
  assert.equal(payable.date, values.date);
  assert.equal(payable.due, values.due);
  assert.equal(payable.method, values.method);
  assert.equal(payable.bank, values.bank);
  assert.equal(otherServiceFlowsSnapshot(s), before, 'A nota não pode mexer em estoque, produção, pedidos, romaneios, caixas, cheques, metas ou cadastros.');
  assert.equal(h.document.getElementById('dialog').open, false);
  assert.ok(h.context.CarolaServiceNotesUI.rows.some(item => item.id === note.id));
  assert.deepEqual(h.errors, []);
});

test('detalhe da nota de serviço abre a conta sem pagar e a liquidação financeira preserva a nota', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const {note, payable} = await registerServiceNoteViaForm(h, {reference: 'SERV-PAGAMENTO-001'});
  const originalNote = JSON.stringify(note), beforeOther = otherServiceFlowsSnapshot(s), titleCount = s.titles.length, noteCount = s.notes.length;
  assert.ok(h.markup.includes(note.reference));
  const details = h.document.querySelector(`[data-action="x-service-note-detail"][data-id="${note.id}"]`);
  assert.ok(details);
  await h.click(details);
  const detailMarkup = h.document.getElementById('dialog-content').innerHTML;
  assert.ok(detailMarkup.includes(note.reference));
  assert.ok(detailMarkup.includes(payable.id));
  assert.ok(detailMarkup.includes(note.person));
  const toPayable = h.document.querySelector(`[data-action="x-service-note-payable"][data-id="${note.id}"]`);
  assert.ok(toPayable);
  await h.click(toPayable);
  assert.equal(h.A.route, 'financeiro');
  assert.equal(h.A.tab.financeiro, 'pagar');
  assert.equal(h.A.filter.fin.q, payable.id);
  assert.equal(payable.status, 'Aberto', 'Navegar para a conta não pode efetuar pagamento.');
  assert.equal(JSON.stringify(note), originalNote);
  assert.equal(otherServiceFlowsSnapshot(s), beforeOther);

  const pay = h.document.querySelector(`[data-action="title-pay"][data-id="${payable.id}"]`);
  assert.ok(pay);
  await h.click(pay);
  const paymentForm = h.document.querySelector(`[data-form="title-pay:${payable.id}"]`);
  assert.ok(paymentForm);
  await h.submit(paymentForm, {paid: F.today, bank: 'Conta usada na liquidação do teste'});
  assert.equal(payable.status, 'Pago');
  assert.equal(payable.paid, F.today);
  assert.equal(payable.bank, 'Conta usada na liquidação do teste');
  assert.equal(JSON.stringify(note), originalNote, 'Pagar a conta vinculada não pode alterar o documento da nota.');
  assert.equal(s.titles.length, titleCount);
  assert.equal(s.notes.length, noteCount);
  assert.equal(otherServiceFlowsSnapshot(s), beforeOther);
  await openServiceNotes(h);
  const listed = h.context.CarolaServiceNotesUI.rows.find(item => item.id === note.id);
  assert.ok(listed);
  assert.equal(listed.payableStatus, 'Pago');
  assert.equal(listed.payable.id, payable.id);
  assert.equal(JSON.stringify(s.notes.find(item => item.id === note.id)), originalNote);
  assert.deepEqual(h.errors, []);
});

test('repetir nota de serviço do mesmo prestador, número, série e unidade não cria outra conta', async () => {
  const h = createHarness(), s = h.A.state;
  const {values} = await registerServiceNoteViaForm(h, {reference: 'SERV-DUPLICADA-001'});
  await h.click(h.document.querySelector('[data-action="x-service-note-new"]'));
  const form = h.document.querySelector('[data-form="x-service-note-register"]');
  const before = JSON.stringify(s);
  await h.submit(form, {...values, amount: 999, notes: 'Tentativa repetida não deve criar conta'});
  assert.equal(JSON.stringify(s), before);
  assert.equal(h.document.getElementById('dialog').open, true);
  assert.match(form.querySelector('.form-error').textContent, /já|duplic|registr|cadastr/i);
  assert.deepEqual(h.errors, []);
});

test('consulta de notas de serviço mantém filtros e detalhes para acesso somente leitura', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const {note} = await registerServiceNoteViaForm(h, {reference: 'SERV-CONSULTA-001'});
  s.users.push({id: 'service-notes-readonly', name: 'Consulta de notas de serviço', role: 'Consulta', active: true, email: 'servicos-consulta@exemplo.test', units: ['fab'], permissions: Object.fromEntries(F.modules.map(module => [module, {view: true, edit: false, export: false}]))});
  await h.change(h.document.getElementById('demo-user'), 'service-notes-readonly');
  await openServiceNotes(h);
  const create = h.document.querySelector('[data-action="x-service-note-new"]');
  assert.ok(!create || create.disabled, 'O acesso somente leitura não pode registrar notas.');
  const filter = h.document.querySelector('[data-form="x-service-note-filter"]');
  assert.ok(filter);
  assert.equal(filter.querySelector('[type="submit"]').disabled, false);
  await h.submit(filter, {q: note.reference, status: 'Aberto', from: F.today, to: F.today});
  assert.equal(h.context.CarolaServiceNotesUI.rows.length, 1);
  assert.equal(h.context.CarolaServiceNotesUI.rows[0].id, note.id);
  const details = h.document.querySelector(`[data-action="x-service-note-detail"][data-id="${note.id}"]`);
  assert.ok(details);
  assert.equal(details.disabled, false);
  await h.click(details);
  assert.ok(h.document.getElementById('dialog-content').innerHTML.includes(note.reference));
  const before = JSON.stringify(s);
  assert.throws(() => h.E.actions['x-service-note-new'](), /permiss|acesso/i);
  assert.equal(JSON.stringify(s), before);
  F.user(s).permissions.financeiro.view = false;
  assert.throws(() => h.E.actions['x-service-note-payable'](note.id), /permiss|acesso/i);
  assert.equal(h.A.route, 'fiscal');
  assert.deepEqual(h.errors, []);
});

test('notas de serviço ficam isoladas por unidade e permitem numeração igual em outra loja', async () => {
  const h = createHarness(), s = h.A.state, F = h.A.F;
  const factory = await registerServiceNoteViaForm(h, {reference: 'SERV-UNIDADE-001', date: F.offset(-2)});
  await h.change(h.document.getElementById('demo-unit'), 'mar');
  assert.equal(s.unit, 'mar');
  await openServiceNotes(h);
  assert.equal(h.context.CarolaServiceNotesUI.rows.some(item => item.id === factory.note.id), false);
  const shop = await registerServiceNoteViaForm(h, {reference: factory.note.reference, series: factory.note.series, person: factory.note.person, providerDocument: factory.note.providerDocument, date: F.today});
  assert.equal(shop.note.unit, 'mar');
  assert.equal(shop.payable.unit, 'mar');
  assert.notEqual(shop.note.id, factory.note.id);
  assert.notEqual(shop.payable.id, factory.payable.id);
  assert.equal(h.context.CarolaServiceNotesUI.rows.some(item => item.id === factory.note.id), false);
  await h.submit(h.document.querySelector('[data-form="x-service-note-filter"]'), {q: shop.note.reference, status: 'Aberto', from: F.today, to: F.today});
  assert.equal(h.context.CarolaServiceNotesUI.rows.length, 1);
  assert.equal(h.context.CarolaServiceNotesUI.rows[0].id, shop.note.id);
  await h.change(h.document.getElementById('demo-unit'), 'fab');
  await openServiceNotes(h);
  await h.submit(h.document.querySelector('[data-form="x-service-note-filter"]'), {q: factory.note.reference, status: 'Aberto', from: factory.note.date, to: factory.note.date});
  assert.equal(h.context.CarolaServiceNotesUI.rows.length, 1);
  assert.equal(h.context.CarolaServiceNotesUI.rows[0].id, factory.note.id);
  assert.equal(h.context.CarolaServiceNotesUI.rows.some(item => item.id === shop.note.id), false);
  assert.equal(s.titles.filter(title => title.source === 'service-note').length, 2);
  assert.deepEqual(h.errors, []);
});
