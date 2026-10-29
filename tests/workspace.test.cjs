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
