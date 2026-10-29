/* Ambientes comerciais da By Carola. Extensões sobre a aplicação original. */
(function (root) {
  'use strict';
  const E = root.CarolaExtensions ||= { installers: [], views: {}, actions: {}, forms: {}, afterRender: [] };
  E.installers.push(function (A) {
    const C = root.CarolaDomain, F = A.F, $ = s => document.querySelector(s);
    const S = () => A.state, esc = A.esc, brl = A.brl, num = A.num, dt = A.dt;
    const ui = { posCart: [], shopCart: [], posTab: 'venda', shopStep: 'catalogo', shopOrder: '', query: '', shopQuery: '', category: '', order: {}, posReport: {}, storeSession: null, loginStore: '', shopUnit: 'fab', shopCategory: '', selectedProduct: '' };
    try { ui.storeSession = JSON.parse(sessionStorage.getItem('carola-pdv-session') || 'null'); } catch (_) {}
    const states = ['Orçamento', 'Faturamento', 'Pedido faturado', 'Consignado', 'Devolução de produtos', 'Em separação', 'Enviado', 'Entregue'];
    const ufs = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    const b = (label, action, id = '', cls = '', ico = '') => `<button type="button" class="btn ${cls}" data-action="${action}" data-id="${esc(id)}">${ico ? A.icon(ico) : ''}${label}</button>`;
    const submit = label => `<button class="btn primary" type="submit">${label}</button>`;
    const error = '<p class="form-error" role="alert"></p>';
    const field = A.input, select = A.select;
    const store = id => S().stores.find(x => x.id === id);
    const product = id => S().products.find(x => x.id === id);
    const allowedUnits = () => F.user(S())?.units || [];
    const permittedStores = () => S().stores.filter(x => x.active && allowedUnits().includes(x.unit));
    const requireEdit = mod => F.assert(F.allow(S(), mod, 'edit'), 'Este usuário não tem permissão para esta operação.');
    const currentSession = () => {
      const session = ui.storeSession, item = session && store(session.storeId);
      if (!item?.active || !item.access.some(x => x.login === session.login && x.userId === session.userId && x.role === session.role) || !S().users.some(x => x.id === session.userId && x.active)) return null;
      return session;
    };
    const posStore = () => store(currentSession()?.storeId);
    const posUnit = () => currentSession()?.unit || S().unit;
    const pqty = (id, unit) => F.at(S(), id, unit);
    const isSale = o => o.status !== 'Orçamento' && o.status !== 'Consignado' && o.status !== 'Cancelado';
    const net = o => A.netOrder(o);
    const shade = p => ({ Areia: '#cfc1a4', Preto: '#414341', Azul: '#8b9da9', Oliva: '#8d987d', Branco: '#e8e6df', Terracota: '#b98b72' }[p.color] || '#b4aaa0');
    const garment = (p, large = false) => {
      const category = (p.category || '').toLowerCase();
      const path = /cal[çc]a|short/.test(category) ? 'M30 15H70L77 91H54L50 46 45 91H23L30 15ZM30 27H70M50 16V41' : /vestido|saia/.test(category) ? 'M39 10 28 20 21 36 33 42 36 33 36 53 17 87Q50 100 83 87L64 53V33L67 42 79 36 72 20 61 10Q50 22 39 10ZM36 53H64' : 'M35 15 19 23 9 44 28 52 35 40 33 91H67L65 40 72 52 91 44 81 23 65 15Q50 28 35 15ZM50 25V90';
      return `<div class="fashion-art ${large ? 'large' : ''}" style="--garment:${shade(p)}"><svg viewBox="0 0 100 108" aria-label="Ilustração de ${esc(p.name)}" role="img"><path d="${path}"/></svg><span>${esc(p.collection || 'By Carola')}</span></div>`;
    };
    const persistSession = () => { try { sessionStorage.setItem('carola-pdv-session', JSON.stringify(ui.storeSession)); } catch (_) {} };
    const envHead = (kind, title, sub, actions = '') => `<div class="env-bar ${kind}"><a href="#inicio" class="env-back">← Gestão By Carola</a><span class="env-location">${kind === 'retail' ? 'AMBIENTE PDV' : 'LOJA ONLINE'}</span><span class="grow"></span>${actions}</div><header class="commerce-head"><div><p class="commerce-kicker">${kind === 'retail' ? 'ATENDIMENTO E OPERAÇÃO DE LOJA' : 'BY CAROLA · COLEÇÃO ESSÊNCIA'}</p><h1>${title}</h1><p>${sub}</p></div></header>`;
    function storeEditor(id = '') {
      requireEdit('lojas');
      const x = store(id) || { name: '', city: '', state: 'PR', address: '', active: true, unit: '', access: [] }, manager = x.access.find(a => a.role === 'Gerente') || {}, seller = x.access.find(a => a.role === 'Vendedor') || {};
      const people = S().users.filter(u => u.active).map(u => [u.id, u.name]);
      A.modal(id ? 'Editar loja e acessos do PDV' : 'Cadastrar loja e acessos do PDV', `<div class="form-grid">${field('Nome da loja *', 'name', x.name, 'text', 'required maxlength="90"')}${select('Unidade vinculada', 'unit', [['', 'Criar uma nova unidade'], ...S().units.map(u => [u.id, u.name])], x.unit, id ? 'disabled' : '')}${field('Cidade *', 'city', x.city, 'text', 'required maxlength="70"')}${select('Estado *', 'state', ufs.filter(Boolean), x.state, 'required')}${field('Endereço', 'address', x.address, 'text', 'maxlength="160"')}<label class="check-label"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Loja ativa</label></div><section class="form-section"><h3>Acesso do gerente</h3><p class="small muted">Gerencia a operação e consulta os resultados da loja.</p><div class="form-grid">${select('Funcionário gerente *', 'managerId', people, manager.userId || S().user, 'required')}${field('Login do gerente *', 'managerLogin', manager.login || 'gerente', 'text', 'required autocomplete="off"')}${field('Senha do gerente *', 'managerPassword', manager.password || '', 'password', 'required minlength="4" autocomplete="new-password"')}</div></section><section class="form-section"><h3>Acesso do vendedor</h3><p class="small muted">Registra vendas e consulta a operação da loja.</p><div class="form-grid">${select('Funcionário vendedor *', 'sellerId', people, seller.userId || S().user, 'required')}${field('Login do vendedor *', 'sellerLogin', seller.login || 'vendedor', 'text', 'required autocomplete="off"')}${field('Senha do vendedor *', 'sellerPassword', seller.password || '', 'password', 'required minlength="4" autocomplete="new-password"')}</div></section><p class="small muted mt">Credenciais demonstrativas salvas apenas neste navegador. A loja e seus vendedores aparecerão nos relatórios de vendas.</p>`, 'x-store:' + id, 'Salvar loja e acessos');
    }
    function storesPage() {
      const list = S().stores.filter(x => allowedUnits().includes(x.unit));
      return A.header('Lojas, unidades de estoque e acessos de gerente e vendedor.', b('Cadastrar loja', 'x-store-new', '', 'primary', 'plus')) + `<div class="stats">${A.stat('Lojas ativas', list.filter(x => x.active).length)}${A.stat('Unidades vinculadas', new Set(list.map(x => x.unit)).size)}${A.stat('Acessos ao PDV', list.reduce((n, x) => n + x.access.length, 0))}${A.stat('Vendas das lojas', brl(S().orders.filter(o => list.some(x => x.unit === o.unit) && isSale(o)).reduce((n, o) => n + net(o), 0)))}</div><div class="product-grid">${list.map(x => `<article class="card store-card"><div class="space">${A.badge(x.active ? 'Ativa' : 'Inativa', x.active ? 'green' : '')}${A.badge(A.unitName(x.unit), 'blue')}</div><div class="store-symbol">${A.icon('pdv')}</div><h2>${esc(x.name)}</h2><p>${esc(x.city || 'Cidade não informada')} · ${esc(x.state || '—')}</p><p class="small muted">${esc(x.address || 'Endereço não informado')}</p><div class="store-access">${x.access.map(a => `<div><span>${esc(a.role)}</span><strong>${esc(S().users.find(u => u.id === a.userId)?.name || a.login)}</strong><small>Login: ${esc(a.login)}</small></div>`).join('')}</div><footer class="row">${b('Editar loja', 'x-store-edit', x.id, 'sm')}${b('Abrir PDV', 'x-open-store', x.id, 'sm primary')}${b('Relatório', 'x-store-report', x.id, 'sm plain')}</footer></article>`).join('') || A.empty('Cadastre a primeira loja para começar.')}</div>`;
    }
    function posLogin() {
      const list = permittedStores(), selected = store(ui.loginStore) || list[0];
      ui.loginStore = selected?.id || '';
      return envHead('retail', 'Sua loja, em operação.', 'Entre no PDV com o acesso do gerente ou vendedor.') + `<div class="pos-login-layout"><section class="pos-login-copy"><span class="pos-emblem">BC</span><h2>O atendimento começa aqui.</h2><p>Estoque da unidade, venda identificada e resultado da loja no mesmo fluxo.</p><div class="login-features"><span>01 · Escolha a loja</span><span>02 · Identifique o operador</span><span>03 · Atenda e acompanhe</span></div></section><section class="card pos-login"><h2>Acessar ponto de venda</h2><form data-form="x-pos-login" class="stack mt">${select('Loja *', 'storeId', list.map(x => [x.id, x.name]), selected?.id || '', 'required data-commerce-change="login-store"')}${field('Login *', 'login', '', 'text', 'required autocomplete="username" placeholder="gerente ou vendedor"')}${field('Senha *', 'password', '', 'password', 'required autocomplete="current-password"')}${submit('Entrar no PDV')}${error}</form><div class="demo-credentials"><strong>Acessos para experimentar</strong>${selected?.access.map(a => `<p>${esc(a.role)} · <code>${esc(a.login)}</code> / <code>${esc(a.password)}</code></p>`).join('') || '<p>Cadastre uma loja e seus acessos.</p>'}<small>Ambiente local de demonstração.</small></div></section></div>`;
    }
    function stockProducts(unit, q = '', category = '', published = false) {
      return S().products.filter(p => p.active && p.kind === 'acabado' && (!published || p.published) && (!category || p.category === category) && (!q || [p.name, p.ref, p.barcode, p.color, p.size].join(' ').toLowerCase().includes(q.toLowerCase())));
    }
    function posCard(p, unit) {
      const available = pqty(p.id, unit);
      return `<button type="button" class="retail-product" data-action="x-pos-add" data-id="${p.id}" ${available <= 0 ? 'disabled' : ''}>${garment(p)}<div><span class="small muted">${esc(p.ref)}</span><strong>${esc(p.name)}</strong><small>${esc(p.color)} · ${esc(p.size)}${(p.qualityClass === 'second' || p.quality === 'segunda') ? ' · 2ª linha' : ''}</small><div class="space"><b>${brl(p.price)}</b><span>${num(available)} em estoque</span></div></div></button>`;
    }
    function cartRows(cart, prefix) {
      return cart.map((i, n) => { const p = product(i.product); return `<div class="commerce-cart-line"><div>${garment(p)}<div><strong>${esc(p.name)}</strong><small>${esc(p.color)} · ${esc(p.size)}</small><b>${brl(p.price * i.qty)}</b></div>${b('×', `x-${prefix}-remove`, String(n), 'sm plain')}</div><label>Quantidade <input type="number" value="${i.qty}" min="1" max="${pqty(i.product, prefix === 'pos' ? posUnit() : ui.shopUnit)}" step="1" aria-label="Quantidade de ${esc(p.name)}" data-commerce-qty="${prefix}" data-index="${n}"></label></div>`; }).join('');
    }
    const cartTotal = cart => F.round(cart.reduce((a, i) => a + product(i.product).price * i.qty, 0));
    function posCartBox() {
      const total = cartTotal(ui.posCart), session = currentSession(), current = posStore();
      return `<aside class="card retail-cart"><div class="space"><h2>Venda atual</h2>${A.badge(ui.posCart.reduce((n, i) => n + i.qty, 0) + ' peças', 'blue')}</div>${ui.posCart.length ? cartRows(ui.posCart, 'pos') : A.empty('Escolha um produto para iniciar.')}<form data-form="x-pos-checkout" class="stack mt">${field('Cliente *', 'client', '', 'text', 'required placeholder="Nome do cliente" maxlength="90"')}<div class="form-grid">${field('Cidade', 'clientCity', current.city, 'text', 'maxlength="70"')}${select('Estado', 'clientState', ufs, current.state)}</div>${select('Vendedor responsável *', 'sellerId', S().users.filter(u => u.active && u.units.includes(session.unit)).map(u => [u.id, u.name]), session.userId, 'required')}${select('Pagamento', 'method', ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'Cheque'], 'Pix')}${select('Parcelas', 'installments', Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}x`]), 1)}${field('Desconto (R$)', 'discount', '0', 'number', 'min="0" step="0.01" data-commerce-input="pos-discount"')}<div class="retail-totals"><span>Subtotal</span><b>${brl(total)}</b><strong>Total a pagar</strong><strong id="retail-total">${brl(total)}</strong></div><button class="btn primary full" ${!ui.posCart.length ? 'disabled' : ''}>Concluir venda</button>${error}</form><p class="small muted mt">A venda atualiza estoque, caixa e financeiro da loja selecionada.</p></aside>`;
    }
    function posReportData() {
      const f = ui.posReport, from = f.from || F.month, to = f.to || F.today, session = currentSession();
      F.assert(session, 'Entre no PDV.');
      const selected = C.sales(S(), { from, to, unit: session.unit });
      const sellerName = S().users.find(u => u.id === f.seller)?.name;
      const matchesSeller = order => !f.seller || !!order && (order.sellerId === f.seller || !!sellerName && order.seller === sellerName);
      const orders = selected.orders.filter(matchesSeller);
      const returns = selected.returns.filter(item => matchesSeller(S().orders.find(order => order.id === item.orderId)));
      const rows = [
        ...orders.map(order => ({ type: 'Venda', id: order.id, orderId: order.id, date: order.date, order,
          client: order.client, seller: order.seller, method: order.method, value: order.total,
          qty: order.items.reduce((sum, item) => sum + item.qty, 0) })),
        ...returns.map(item => {
          const order = S().orders.find(order => order.id === item.orderId);
          return { type: 'Devolução', id: item.id, orderId: item.orderId, date: item.date, order,
            client: order?.client || 'Cliente não identificado', seller: order?.seller,
            method: order?.method, value: -item.amount, qty: -item.qty };
        })
      ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const total = F.round(rows.reduce((sum, row) => sum + row.value, 0));
      const pieces = rows.reduce((sum, row) => sum + row.qty, 0);
      return { session, from, to, orders, returns, rows, total, pieces };
    }
    function posReportPage() {
      const f = ui.posReport, data = posReportData(), { from, to, session, orders, returns, rows, total, pieces } = data;
      return `<form class="filters" data-form="x-pos-report">${field('Data inicial', 'from', from, 'date', 'required')}${field('Data final', 'to', to, 'date', 'required')}${select('Vendedor', 'seller', [['', 'Todos da loja'], ...S().users.filter(u => u.units.includes(session.unit)).map(u => [u.id, u.name])], f.seller || '')}${submit('Aplicar período')}${b('Exportar CSV', 'x-pos-export', '', '', 'download')}${error}</form><div class="stats">${A.stat('Vendas no período', orders.length)}${A.stat('Receita líquida', brl(total))}${A.stat('Ticket médio', brl(orders.length ? total / orders.length : 0))}${A.stat('Peças líquidas', num(pieces))}</div><p class="small muted mb">${orders.length} venda(s) e ${returns.length} devolução(ões) registradas no período. As devoluções entram com valor e quantidade negativos na data em que ocorreram, mesmo quando a venda original é anterior.</p>${A.table(['Documento / cliente', 'Data', 'Tipo', 'Vendedor', 'Pagamento', 'Peças', 'Valor', ''], rows.map(row => `<tr><td><b>${esc(row.id)}</b><small>${esc(row.client)}</small>${row.type === 'Devolução' ? `<small>Venda de origem: ${esc(row.orderId)}</small>` : ''}</td><td>${dt(row.date)}</td><td>${A.badge(row.type, row.type === 'Devolução' ? 'red' : 'blue')}</td><td>${esc(row.seller || '—')}</td><td>${esc(row.method || '—')}</td><td>${num(row.qty)}</td><td class="${row.value < 0 ? 'red' : ''}">${brl(row.value)}</td><td>${row.order ? b('Ver recibo', 'x-order-details', row.orderId, 'sm') : ''}</td></tr>`), `Total dos movimentos: ${num(pieces)} peça(s) · ${brl(total)}`)}`;
    }
    function posReturns() {
      const list = S().orders.filter(o => o.unit === posUnit() && isSale(o) && o.items.some(i => i.qty > (i.returned || 0)));
      const roms = S().consignments.filter(r => r.unit === posUnit());
      return `<div class="grid2"><section class="card"><h2>Devolver ou trocar uma venda</h2><p class="small muted mb">Escolha uma venda da loja. A devolução gera crédito e repõe as peças; a troca pode incluir uma nova peça no mesmo atendimento.</p>${A.table(['Venda / cliente', 'Data', 'Valor', ''], list.slice(0, 30).map(o => `<tr><td><b>${esc(o.id)}</b><small>${esc(o.client)}</small></td><td>${dt(o.date)}</td><td>${brl(net(o))}</td><td>${b('Trocar / devolver', 'x-pos-return', o.id, 'sm')}</td></tr>`))}</section><section class="card"><h2>Peças em consignação</h2><p class="small muted mb">Registre a devolução ou substitua peças no mesmo romaneio, preservando o histórico.</p>${roms.length ? roms.map(r => `<div class="alert-row"><span><b>${esc(r.id)}</b><small>${esc(S().contacts.find(x => x.id === r.rep)?.name)}</small></span>${b('Movimentar', 'x-rom-edit', r.id, 'sm')}</div>`).join('') : A.empty('Não há romaneios nesta loja.')}</section></div>`;
    }
    function posPage() {
      const session = currentSession();
      if (!session) return posLogin();
      const current = posStore(), cash = S().cash.find(c => c.unit === session.unit && c.open && c.users.includes(session.userId));
      const categories = [...new Set(stockProducts(session.unit).map(p => p.category))];
      return envHead('retail', esc(current.name), `${esc(session.name)} · ${esc(session.role)} · ${cash ? esc(cash.name) + ' aberto' : 'Caixa fechado para este operador'}`, b('Trocar acesso', 'x-pos-logout', '', 'sm')) + `<div class="retail-nav">${[['venda', 'Nova venda'], ['relatorios', 'Resultados da loja'], ['devolucoes', 'Trocas e devoluções']].map(([id, label]) => b(label, 'x-pos-tab', id, ui.posTab === id ? 'active' : '')).join('')}<span class="grow"></span><span class="retail-session">${A.badge(session.role, 'blue')} ${esc(session.login)}</span></div>${ui.posTab === 'relatorios' ? posReportPage() : ui.posTab === 'devolucoes' ? posReturns() : `<div class="retail-layout"><section><form class="filters" data-form="x-pos-search"><label class="field grow"><span>Produto, referência ou código de barras</span><input name="q" value="${esc(ui.query)}" placeholder="Busque ou use o leitor de código" autofocus></label>${select('Categoria', 'category', [['', 'Todas'], ...categories], ui.category)}${submit('Buscar')}${b('Limpar', 'x-pos-clear')}</form>${!cash ? `<div class="notice amber mb">O operador precisa de um caixa aberto nesta loja. ${b('Configurar / abrir caixa', 'x-pos-cash', '', 'sm')}</div>` : ''}<div class="retail-products">${stockProducts(session.unit, ui.query, ui.category).map(p => posCard(p, session.unit)).join('') || A.empty('Nenhum produto corresponde à busca.')}</div></section>${posCartBox()}</div>`}`;
    }
    function shopProduct(p) {
      const available = pqty(p.id, ui.shopUnit);
      return `<article class="shop-product"><button type="button" class="shop-image" data-action="x-shop-product" data-id="${p.id}">${garment(p, true)}${available <= 0 ? '<span class="shop-stock-label">Esgotado</span>' : (p.qualityClass === 'second' || p.quality === 'segunda') ? '<span class="shop-stock-label">Segunda linha</span>' : ''}</button><div class="shop-product-info"><span>${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.color)} · tamanho ${esc(p.size)}</p><div class="space"><strong>${brl(p.price)}</strong>${b('Adicionar', 'x-shop-add', p.id, 'sm', 'plus')}</div></div></article>`;
    }
    function shopNav() {
      return `<nav class="shop-nav"><a href="#loja" data-action="x-shop-home" class="shop-wordmark">BY CAROLA<span>ESSÊNCIA EM CADA DETALHE</span></a><div>${b('Coleção', 'x-shop-home', '', 'plain')}${b('Meus pedidos', 'x-shop-orders', '', 'plain')}${b(`Sacola (${ui.shopCart.reduce((n, x) => n + x.qty, 0)})`, 'x-shop-cart', '', 'shop-bag')}</div></nav>`;
    }
    function shopCatalog() {
      const categories = [...new Set(stockProducts(ui.shopUnit, '', '', true).map(p => p.category))];
      return `<section class="shop-hero"><div><p class="commerce-kicker">ESSÊNCIA · VERÃO 2027</p><h1>Leveza para<br>viver o seu tempo.</h1><p>Formas naturais, detalhes que acolhem.<br>Conheça a seleção By Carola.</p><a class="btn shop-cta" href="#shop-collection">Explorar a coleção ↓</a></div><div class="hero-fashion"><svg viewBox="0 0 280 320" aria-hidden="true"><ellipse cx="143" cy="303" rx="97" ry="12" fill="#b8a78c" opacity=".22"/><path d="M114 23 80 47 64 100 91 111 107 81 109 149 55 278Q144 309 227 278L175 149 175 81 193 111 220 100 203 47 169 23Q141 49 114 23Z" fill="#b9b798" stroke="#8c9173" stroke-width="1.5"/><path d="M109 149H175M120 158 106 283M160 158 174 283M115 30Q143 58 167 30" stroke="#8c9173" fill="none" stroke-width="1.5"/></svg><span>FEITO PARA ACOMPANHAR VOCÊ.</span></div></section><section id="shop-collection"><div class="shop-section-head"><div><p class="commerce-kicker">ENCONTRE SUA PRÓXIMA PEÇA</p><h2>A coleção</h2></div><form data-form="x-shop-search" class="shop-search"><input aria-label="Buscar na coleção" name="q" value="${esc(ui.shopQuery)}" placeholder="Buscar uma peça…">${submit('Buscar')}</form></div><div class="shop-categories">${b('Todas', 'x-shop-category', '', !ui.shopCategory ? 'active' : '')}${categories.map(c => b(esc(c), 'x-shop-category', c, ui.shopCategory === c ? 'active' : '')).join('')}</div><div class="shop-products">${stockProducts(ui.shopUnit, ui.shopQuery, ui.shopCategory, true).map(shopProduct).join('') || A.empty('Nenhuma peça encontrada.')}</div></section>`;
    }
    function shopCartPage() {
      const total = cartTotal(ui.shopCart);
      return `<div class="shop-page-heading"><p class="commerce-kicker">SEU PRÓXIMO CAPÍTULO</p><h1>Sua sacola</h1><p>Revise as peças antes de continuar.</p></div><div class="shop-checkout-layout"><section class="card">${ui.shopCart.length ? cartRows(ui.shopCart, 'shop') : A.empty('Sua sacola está esperando por uma escolha.')}${b('Continuar explorando', 'x-shop-home', '', 'plain')}</section><aside class="card shop-summary"><h2>Resumo do pedido</h2><dl><dt>Subtotal</dt><dd>${brl(total)}</dd><dt>Entrega</dt><dd>Grátis nesta simulação</dd><dt class="total">Total</dt><dd class="total">${brl(total)}</dd></dl>${b('Continuar para entrega', 'x-shop-checkout', '', 'primary full')}${b('Acompanhar meus pedidos', 'x-shop-orders', '', 'plain full')}</aside></div>`;
    }
    function shopCheckout() {
      return `<div class="shop-page-heading"><p class="commerce-kicker">FALTA POUCO</p><h1>Concluir seu pedido</h1><p>Entrega → pagamento → confirmação</p></div><div class="shop-checkout-layout"><form class="card" data-form="x-shop-checkout"><h2>Seus dados</h2><div class="form-grid mt">${field('Nome completo *', 'client', '', 'text', 'required maxlength="90" autocomplete="name"')}${field('E-mail *', 'email', '', 'email', 'required autocomplete="email"')}${field('Telefone *', 'phone', '', 'tel', 'required autocomplete="tel"')}${field('CEP *', 'zip', '', 'text', 'required pattern="[0-9]{5}-?[0-9]{3}" placeholder="00000-000" autocomplete="postal-code"')}</div><h2 class="mt">Onde entregar</h2><div class="form-grid mt">${field('Endereço *', 'address', '', 'text', 'required maxlength="140" autocomplete="street-address"')}${field('Número e complemento *', 'addressNumber', '', 'text', 'required maxlength="70"')}${field('Cidade *', 'clientCity', '', 'text', 'required maxlength="70" autocomplete="address-level2"')}${select('Estado *', 'clientState', [['', 'Selecione'], ...ufs.filter(Boolean)], '', 'required')}</div><h2 class="mt">Pagamento</h2><div class="form-grid mt">${select('Forma de pagamento', 'method', ['Pix', 'Cartão', 'Boleto'], 'Pix')}${select('Parcelas no cartão', 'installments', Array.from({ length: 6 }, (_, i) => [i + 1, `${i + 1}x`]), 1)}</div><p class="small muted mt">Pagamento demonstrativo. Nenhum dado de cartão ou cobrança real é solicitado.</p><div class="dialog-footer">${b('Voltar à sacola', 'x-shop-cart')}${submit('Confirmar pedido')}${error}</div></form><aside class="card shop-summary"><h2>Seu pedido</h2>${ui.shopCart.map(i => `<div class="alert-row"><span>${esc(product(i.product).name)}<small>${esc(product(i.product).color)} · ${esc(product(i.product).size)} · ${i.qty} un.</small></span><b>${brl(product(i.product).price * i.qty)}</b></div>`).join('')}<dl><dt>Total</dt><dd class="total">${brl(cartTotal(ui.shopCart))}</dd></dl></aside></div>`;
    }
    function orderTimeline(o) {
      const steps = ['Em separação', 'Enviado', 'Entregue'], current = steps.indexOf(o.fulfillmentStage || o.status), h = o.fulfillmentHistory || o.history || [];
      return `<ol class="delivery-timeline">${steps.map((s, n) => `<li class="${n <= current ? 'done' : ''}"><span>${n < current ? '✓' : String(n + 1).padStart(2, '0')}</span><div><b>${s}</b><small>${n < current ? 'Concluído' : n === current ? 'Etapa atual' : 'Próxima etapa'}</small></div></li>`).join('')}</ol>${o.trackingCode ? `<div class="notice mb">Rastreamento: <b>${esc(o.trackingCode)}</b></div>` : ''}${h.length ? `<details class="order-history"><summary>Ver histórico do pedido</summary>${h.map(x => `<p>${esc(x.status || x.stage || x.text || '')} <small>${dt(String(x.date || '').slice(0, 10))}</small></p>`).join('')}</details>` : ''}`;
    }
    function shopOrders() {
      const online = S().orders.filter(o => o.channel === 'E-commerce'), selected = online.find(o => o.id === ui.shopOrder);
      return `<div class="shop-page-heading"><p class="commerce-kicker">DO ATELIÊ ATÉ VOCÊ</p><h1>Acompanhe seu pedido</h1><p>Consulte o código e acompanhe cada etapa da entrega.</p></div><form class="card shop-track-search" data-form="x-shop-track">${field('Número do pedido', 'id', ui.shopOrder, 'text', 'required placeholder="VEN-..."')}${submit('Acompanhar')}${error}</form>${selected ? `<article class="card shop-order"><div class="space"><div><h2>${esc(selected.id)}</h2><p>${esc(selected.client)} · ${dt(selected.date)}</p></div>${A.badge(selected.fulfillmentStage || selected.status, 'green')}</div>${orderTimeline(selected)}${A.table(['Peça', 'Cor / tamanho', 'Quantidade', 'Valor'], selected.items.map(i => `<tr><td>${esc(product(i.product).name)}</td><td>${esc(product(i.product).color)} / ${esc(product(i.product).size)}</td><td>${i.qty}</td><td>${brl(i.price * i.qty)}</td></tr>`))}<div class="space mt"><strong>Total ${brl(selected.total)}</strong>${(selected.fulfillmentStage || selected.status) === 'Enviado' ? b('Recebi meu pedido', 'x-shop-delivered', selected.id, 'primary') : (selected.fulfillmentStage || selected.status) === 'Entregue' ? A.badge('Entrega confirmada. Obrigado!', 'green') : '<span class="small muted">Seu pedido está sendo preparado com cuidado.</span>'}</div></article>` : ''}<section class="mt"><h2 class="mb">Pedidos desta demonstração</h2><div class="shop-order-list">${online.map(o => `<button type="button" data-action="x-shop-track-order" data-id="${o.id}"><span><b>${esc(o.id)}</b><small>${esc(o.client)} · ${dt(o.date)}</small></span>${A.badge(o.fulfillmentStage || o.status, 'green')}<strong>${brl(o.total)}</strong><span>Ver pedido →</span></button>`).join('') || A.empty('Seu primeiro pedido aparecerá aqui.')}</div></section>`;
    }
    function shopPage() {
      return `<div class="shop-shell">${envHead('shop', '', '', '')}${shopNav()}${ui.shopStep === 'sacola' ? shopCartPage() : ui.shopStep === 'checkout' ? shopCheckout() : ui.shopStep === 'pedidos' ? shopOrders() : shopCatalog()}<footer class="shop-footer"><b>BY CAROLA</b><p>Detalhes que acompanham a sua essência.</p><span>Loja demonstrativa · estoque integrado à gestão</span></footer></div>`;
    }
    function canPrintReceipt(order) {
      if (A.route === 'pdv') {
        const session = currentSession();
        return !!session && session.unit === order.unit && (!order.storeId || order.storeId === session.storeId);
      }
      return F.allow(S(), 'pedidos', 'export') && allowedUnits().includes(order.unit);
    }
    function orderDetails(id) {
      const o = S().orders.find(x => x.id === id); F.assert(o, 'Pedido não encontrado.');
      const online = o.channel === 'E-commerce', note = S().notes.find(n => n.orderId === id && n.status !== 'Cancelada');
      A.modal(`${esc(o.id)} · ${esc(o.client)}`, `<div class="detail-grid"><div><span>Situação comercial</span><strong>${esc(o.billingStatus || o.status)}</strong></div><div><span>Canal</span><strong>${esc(o.channel)}</strong></div><div><span>Loja</span><strong>${esc(A.unitName(o.unit))}</strong></div><div><span>Vendedor</span><strong>${esc(o.seller || 'Online')}</strong></div><div><span>Cliente</span><strong>${esc(o.clientCity || '')}${o.clientState ? ' / ' + esc(o.clientState) : ''}</strong></div><div><span>Pagamento</span><strong>${esc(o.method)} ${o.installments > 1 ? '· ' + o.installments + 'x' : ''}</strong></div></div>${online ? orderTimeline(o) : ''}${A.table(['Produto / variante', 'Qtd.', 'Devolvida', 'Preço', 'Subtotal'], o.items.map(i => `<tr><td>${esc(product(i.product).name)}<small>${esc(product(i.product).color)} · ${esc(product(i.product).size)}</small></td><td>${i.qty}</td><td>${i.returned || 0}</td><td>${brl(i.price)}</td><td>${brl(i.price * i.qty)}</td></tr>`))}<div class="space mt"><span>${note ? `Nota ${esc(note.id)}` : 'Nota fiscal ainda não emitida'}</span><strong class="total">${brl(net(o))}</strong></div>${o.creditApplied ? `<p class="small muted mt">Crédito de troca utilizado: ${brl(o.creditApplied)} · diferença a pagar: ${brl(o.paidDifference || 0)}</p>` : ''}${o.shippingAddress ? `<p class="small muted mt">Entrega: ${esc(typeof o.shippingAddress === 'string' ? o.shippingAddress : JSON.stringify(o.shippingAddress))}</p>` : ''}<div class="dialog-footer">${canPrintReceipt(o) ? b('Imprimir recibo', 'x-print-receipt', o.id, '', 'print') : ''}${o.status === 'Orçamento' ? b('Enviar para faturamento', 'invoice-budget', o.id, 'primary') : ''}${!note && o.status !== 'Orçamento' && F.allow(S(), 'fiscal', 'edit') ? b('Emitir nota demonstrativa', 'x-order-note', o.id, 'primary') : ''}${online && (o.fulfillmentStage || o.status) === 'Em separação' ? b('Marcar como enviado', 'x-order-send', o.id, 'primary') : ''}${online && (o.fulfillmentStage || o.status) === 'Enviado' ? b('Confirmar entrega', 'x-order-delivered', o.id, 'primary') : ''}${!online && o.status !== 'Orçamento' && o.items.some(i => i.qty > (i.returned || 0)) && (A.route === 'pdv' || F.allow(S(), 'pedidos', 'edit')) ? b('Trocar / devolver', 'x-pos-return', o.id) : ''}</div>`);
    }
    function orderDocuments() {
      const f = ui.order, from = f.from || S().floor, to = f.to || F.today;
      // Uma remessa em posse do representante é um documento operacional,
      // não uma venda. A projeção só existe nesta consulta e na exportação.
      const consignments = S().consignments.filter(rom => rom.status !== 'Fechado').map(rom => {
        const representative = S().contacts.find(contact => contact.id === rom.rep);
        const items = rom.items.map(item => ({ product: item.product,
          qty: Math.max(0, Number(item.qty) - Number(item.sold || 0) - Number(item.returned || 0) - Number(item.damaged || 0)),
          price: Number(item.price ?? product(item.product)?.price ?? 0), returned: 0
        })).filter(item => item.qty > 0);
        return { id: rom.id, unit: rom.unit, date: rom.date, status: 'Consignado', channel: 'Representante',
          client: representative?.name || 'Representante não identificado', clientCity: representative?.city || '',
          clientState: representative?.state || '', seller: '', items,
          total: F.round(items.reduce((sum, item) => sum + item.qty * item.price, 0)), virtualConsignment: true };
      }).filter(rom => rom.items.length);
      return [...S().orders, ...consignments].filter(order => allowedUnits().includes(order.unit) && (!f.unit || order.unit === f.unit)
        && order.date >= from && order.date <= to
        && (!f.q || [order.id, order.client, order.seller].join(' ').toLowerCase().includes(f.q.toLowerCase()))
        && (!f.status || [order.status, order.billingStatus, order.fulfillmentStage].includes(f.status))
        && (!f.channel || order.channel === f.channel));
    }
    function ordersPage() {
      const f = ui.order, from = f.from || S().floor, to = f.to || F.today, list = orderDocuments();
      const statusHelp = `<div class="status-guide"><span><b>Orçamento</b> sem reserva ou baixa</span><span><b>Faturamento</b> pronto para emitir nota</span><span><b>Pedido faturado</b> nota emitida</span><span><b>Online</b> separação → envio → entrega</span></div>`;
      return A.header('Todos os canais, do orçamento à entrega.', b('Exportar CSV', 'x-orders-export', '', '', 'download') + b('Novo orçamento', 'budget', '', 'primary', 'plus')) + statusHelp + `<form class="filters" data-form="x-orders-filter">${field('Cliente ou documento', 'q', f.q || '', 'text', 'placeholder="Buscar pedido ou cliente"')}${select('Situação', 'status', [['', 'Todas as situações'], ...states], f.status || '')}${select('Canal', 'channel', [['', 'Todos os canais'], 'Loja física', 'E-commerce', 'Representante', 'Atacado', 'Autoatendimento'], f.channel || '')}${select('Unidade', 'unit', [['', 'Todas as autorizadas'], ...S().units.filter(u => allowedUnits().includes(u.id)).map(u => [u.id, u.name])], f.unit || '')}${field('De', 'from', from, 'date')}${field('Até', 'to', to, 'date')}${submit('Filtrar')}${error}</form><div class="stats">${A.stat('Documentos', list.length)}${A.stat('Orçamentos', list.filter(o => o.status === 'Orçamento').length)}${A.stat('A emitir nota', list.filter(o => (o.billingStatus || o.status) === 'Faturamento').length)}${A.stat('Vendas líquidas', brl(list.filter(isSale).reduce((n, o) => n + net(o), 0)))}</div>${A.table(['Pedido / cliente', 'Loja / canal', 'Data', 'Situação', 'Valor / em posse', ''], list.map(o => `<tr><td><b>${esc(o.id)}</b><small>${esc(o.client)}${o.clientCity ? ' · ' + esc(o.clientCity) + '/' + esc(o.clientState) : ''}</small></td><td>${esc(A.unitName(o.unit))}<small>${esc(o.channel)}</small></td><td>${dt(o.date)}</td><td>${A.badge(o.status, o.status === 'Orçamento' ? 'amber' : o.status === 'Devolução de produtos' ? 'red' : 'green')}${o.billingStatus && o.billingStatus !== o.status ? `<small>${esc(o.billingStatus)}</small>` : ''}</td><td>${brl(o.virtualConsignment ? o.total : net(o))}${o.virtualConsignment ? '<small>Valor em posse · ' + o.items.reduce((n, i) => n + i.qty, 0) + ' peça(s)</small>' : ''}</td><td>${b('Detalhes', o.virtualConsignment ? 'x-rom-details' : 'x-order-details', o.id, 'sm')}${o.status === 'Orçamento' ? b('Faturamento', 'invoice-budget', o.id, 'sm primary') : ''}</td></tr>`))}<p class="small muted mt">Consignações representam peças em posse de terceiros. As vendas são reconhecidas no acerto; devoluções mantêm o documento original e o histórico do crédito.</p>`;
    }
    function consignmentPage() {
      const list = S().consignments.filter(o => o.unit === S().unit), inHand = r => r.items.reduce((n, i) => n + i.qty - i.sold - i.returned - (i.damaged || 0), 0);
      return A.header('Envios, devoluções e novos itens no mesmo romaneio.', b('Novo romaneio', 'consign-new', '', 'primary', 'plus')) + `<div class="stats">${A.stat('Romaneios abertos', list.filter(o => o.status !== 'Fechado').length)}${A.stat('Peças em posse', list.reduce((n, r) => n + inHand(r), 0))}${A.stat('Comissão apurada', brl(list.reduce((n, r) => n + r.history.reduce((a, h) => a + (h.commission || 0), 0), 0)))}${A.stat('Movimentações registradas', list.reduce((n, r) => n + (r.ledger?.length || 0), 0))}</div><div class="stack">${list.map(r => `<article class="card"><div class="space"><div><h2>${esc(r.id)} · ${esc(S().contacts.find(c => c.id === r.rep)?.name)}</h2><p class="small muted">${esc(A.unitName(r.unit))} · prazo ${dt(r.due)} · comissão ${r.commission}%</p></div>${A.badge(r.status, r.status === 'Fechado' ? 'green' : 'amber')}</div><div class="consign-summary"><span><b>${r.items.reduce((n, i) => n + i.qty, 0)}</b> enviadas</span><span><b>${r.items.reduce((n, i) => n + i.sold, 0)}</b> vendidas</span><span><b>${r.items.reduce((n, i) => n + i.returned, 0)}</b> devolvidas</span><span><b>${inHand(r)}</b> em posse</span></div><div class="row">${r.status !== 'Fechado' ? b('Registrar acerto', 'settle', r.id, 'primary') : ''}${b('Adicionar / devolver peças', 'x-rom-edit', r.id)}${b('Corrigir devolução', 'x-rom-correct', r.id)}${b('Histórico e detalhes', 'x-rom-details', r.id, 'plain')}</div></article>`).join('') || A.empty('Nenhum romaneio nesta unidade.')}</div>`;
    }
    function romEditor(id, correction = false) {
      const rom = S().consignments.find(r => r.id === id); F.assert(rom && (rom.unit === S().unit || rom.unit === posUnit()), 'Romaneio não encontrado nesta unidade.');
      if (A.route !== 'pdv') requireEdit('consignacoes'); else F.assert(currentSession(), 'Entre no PDV.');
      A.modal(`${correction ? 'Corrigir devolução' : 'Movimentar romaneio'} · ${esc(rom.id)}`, `<p class="small muted mb">${correction ? 'Informe quanto estornar de uma devolução anterior. A correção transfere as peças da loja de volta ao representante e cria um registro compensatório.' : 'Novas peças e devoluções são lançadas no mesmo documento. O histórico das movimentações permanece disponível.'}</p>${A.table(['Produto / variante', 'Em posse', correction ? 'Já devolvidas' : 'Devolver agora'], rom.items.map((i, n) => `<tr><td>${esc(product(i.product).name)}<small>${esc(product(i.product).color)} · ${esc(product(i.product).size)}</small></td><td>${i.qty - i.sold - i.returned - (i.damaged || 0)}</td><td><label class="small">${correction ? i.returned + ' devolvidas · estornar:' : ''}<input name="returned${n}" type="number" min="0" max="${correction ? i.returned : i.qty - i.sold - i.returned - (i.damaged || 0)}" value="0" step="1" aria-label="${correction ? 'Estornar devolução de' : 'Devolver'} ${esc(product(i.product).name)}"></label></td></tr>`))}${!correction ? `<section class="form-section"><h3>Adicionar peças ao romaneio</h3><div id="commerce-rom-additions">${additionRow()}</div>${b('Adicionar outro produto', 'x-rom-add-row', '', 'sm plain', 'plus')}</section>` : ''}${A.textArea('Motivo / observação *', 'reason')}<p class="small muted mt">O saldo é conferido antes de qualquer movimento. Nenhum lançamento anterior será apagado.</p>`, (correction ? 'x-rom-correct:' : 'x-rom-edit:') + id, 'Registrar movimentações');
      $('#dialog').querySelector('[name=reason]').required = true;
    }
    function additionRow() {
      return `<div class="rom-add-row"><select name="addProduct" aria-label="Produto adicional">${A.opts([['', 'Selecione um produto'], ...S().products.filter(p => p.active && p.kind === 'acabado').map(p => [p.id, `${p.name} · ${p.color} / ${p.size}`])], '')}</select><input name="addQty" type="number" min="0" step="1" value="0" aria-label="Quantidade adicional">${b('×', 'x-rom-remove-row', '', 'sm plain')}</div>`;
    }
    function romDetails(id) {
      const r = S().consignments.find(x => x.id === id); F.assert(r, 'Romaneio não encontrado.');
      const ledger = r.ledger || [], history = r.history || [];
      A.modal('Histórico · ' + esc(id), `<p class="small muted mb">Cada envio, acerto, devolução e correção fica associado ao mesmo romaneio.</p>${A.table(['Produto', 'Enviadas', 'Vendidas', 'Devolvidas', 'Em posse'], r.items.map(i => `<tr><td>${esc(product(i.product).name)}<small>${esc(product(i.product).color)} · ${esc(product(i.product).size)}</small></td><td>${i.qty}</td><td>${i.sold}</td><td>${i.returned}</td><td>${i.qty - i.sold - i.returned - (i.damaged || 0)}</td></tr>`))}<h3 class="mt mb">Movimentações</h3>${ledger.length ? `<ol class="timeline">${ledger.map(l => `<li><b>${esc(l.type || l.kind || 'Movimentação')}</b> · ${esc(l.reason || l.note || l.text || '')}<small>${dt(String(l.date || F.today).slice(0, 10))} · ${esc(l.actor || l.user || '')}</small>${l.items ? `<small>${l.items.map(i => esc(product(i.product)?.name || i.product) + ' ' + (i.qty > 0 ? '+' : '') + num(i.qty)).join(' · ')}</small>` : ''}${l.additions?.length ? `<small>Adição: ${l.additions.map(i => esc(product(i.product)?.name || i.product) + ' +' + i.qty).join(' · ')}</small>` : ''}${l.returns?.length ? `<small>Devolução: ${l.returns.map(i => esc(product(i.product)?.name || i.product) + ' ' + i.qty).join(' · ')}</small>` : ''}</li>`).join('')}</ol>` : A.empty('Ainda não há movimentações adicionais.')}<h3 class="mt mb">Acertos financeiros</h3>${A.table(['Data', 'Venda bruta', 'Comissão', 'Recebível líquido', 'Documento'], history.filter(h => h.gross !== undefined).map(h => `<tr><td>${dt(h.date)}</td><td>${brl(h.gross)}</td><td>${brl(h.commission)}</td><td>${brl(h.net)}</td><td>${esc(h.order || '—')}</td></tr>`))}`);
    }
    function returnEditor(id) {
      const o = S().orders.find(x => x.id === id); F.assert(o && (allowedUnits().includes(o.unit) || currentSession()?.unit === o.unit), 'Venda não disponível.');
      const canExchange = currentSession()?.unit === o.unit;
      const replacements = canExchange ? S().products.filter(p => p.kind === 'acabado' && p.active && F.at(S(), p.id, o.unit) > 0) : [];
      A.modal('Troca ou devolução · ' + esc(id), `<p class="small muted mb">A peça devolvida retorna ao estoque. Na troca, o crédito é aplicado à peça escolhida e a diferença é registrada no financeiro.</p><div class="form-grid">${select('Peça devolvida *', 'product', o.items.filter(i => i.qty > (i.returned || 0)).map(i => [i.product, `${product(i.product).name} · ${product(i.product).color} / ${product(i.product).size} · saldo ${i.qty - (i.returned || 0)}`]), '', 'required')}${field('Quantidade devolvida *', 'qty', '1', 'number', 'required min="1" step="1"')}${select('Nova peça (opcional)', 'replacement', [['', 'Somente devolver e gerar crédito'], ...replacements.map(p => [p.id, `${p.name} · ${p.color} / ${p.size} · ${brl(p.price)}`])], '')}${field('Quantidade da nova peça', 'replacementQty', '1', 'number', 'min="1" step="1"')}${select('Pagamento da diferença', 'method', ['Pix', 'Dinheiro', 'Cartão', 'Boleto'], 'Pix')}${A.textArea('Motivo *', 'reason')}</div>`, 'x-pos-return:' + id, 'Confirmar troca / devolução');
      $('#dialog').querySelector('[name=reason]').required = true;
      if (!canExchange) $('#dialog').querySelector('[name=replacement]').insertAdjacentHTML('afterend', '<small class="muted">Para trocar por outra peça, abra o PDV e entre na loja. A devolução simples pode ser registrada aqui.</small>');
    }
    function addCart(which, id) {
      if (which === 'pos') F.assert(currentSession(), 'Entre no PDV para vender.');
      const unit = which === 'pos' ? posUnit() : ui.shopUnit, cart = which === 'pos' ? ui.posCart : ui.shopCart, p = product(id);
      F.assert(p?.active && p.kind === 'acabado', 'Produto indisponível.');
      F.assert(which !== 'shop' || p.published, 'Esta peça não está publicada na loja.');
      const current = cart.find(x => x.product === id);
      F.assert(F.at(S(), id, unit) > (current?.qty || 0), 'A quantidade disponível desta peça foi atingida.');
      if (current) current.qty++; else cart.push({ product: id, qty: 1 });
      A.render();
      if (which === 'shop') A.toast('Peça adicionada à sacola.');
    }
    function doReturn(form, v, id) {
      const o = S().orders.find(x => x.id === id); F.assert(o, 'Venda não encontrada.');
      const session = currentSession();
      F.assert(A.route !== 'pdv' ? F.allow(S(), 'pedidos', 'edit') : session?.unit === o.unit, 'Sem acesso a esta venda.');
      let result, replacementOrder;
      A.transaction(() => {
        result = F.returnSale(S(), id, v.product, v.qty, v.reason);
        o.status = 'Devolução de produtos';
        if (v.replacement) {
          const cash = S().cash.find(c => c.unit === o.unit && c.open && c.users.includes(session?.userId || S().user));
          F.assert(cash, 'Abra um caixa autorizado para registrar a nova peça da troca.');
          replacementOrder = C.checkout(S(), { unit: o.unit, client: o.client, clientCity: o.clientCity || '', clientState: o.clientState || '', method: v.method, installments: 1, discount: 0, channel: 'Loja física', items: [{ product: v.replacement, qty: Number(v.replacementQty) }], sellerId: session?.userId || S().user, seller: session?.name || F.user(S()).name, storeId: session?.storeId || S().stores.find(x => x.unit === o.unit)?.id, session, cashId: cash.id, cashSession: cash.session });
          const used = Math.min(result.amount, replacementOrder.total), refund = S().titles.find(t => t.orderId === id && t.type === 'pagar' && t.description?.includes(result.id));
          if (refund) { refund.amount = F.round(result.amount - used); if (!refund.amount) { refund.status = 'Pago'; refund.paid = F.today; } refund.description += ' · crédito utilizado na troca ' + replacementOrder.id; }
          const incoming = S().titles.filter(t => t.orderId === replacementOrder.id && t.type === 'receber');
          let remainingCredit = used;
          incoming.forEach(t => { const portion = Math.min(t.amount, remainingCredit); t.amount = F.round(t.amount - portion); remainingCredit = F.round(remainingCredit - portion); if (!t.amount) { t.status = 'Pago'; t.paid = F.today; } t.creditApplied = portion; });
          replacementOrder.creditApplied = used; replacementOrder.paidDifference = F.round(replacementOrder.total - used); replacementOrder.exchangeOf = id;
        }
      }, v.replacement ? 'Troca registrada.' : 'Devolução registrada e crédito gerado.');
      if (replacementOrder) orderDetails(replacementOrder.id); else A.toast('Crédito disponível: ' + brl(result.amount));
    }
    Object.assign(E.views, { lojas: storesPage, pdv: posPage, loja: shopPage, pedidos: ordersPage, consignacoes: consignmentPage });
    Object.assign(E.actions, {
      'x-store-new': () => storeEditor(), 'x-store-edit': id => storeEditor(id),
      'x-open-store': id => { ui.storeSession = null; ui.loginStore = id; ui.posCart = []; persistSession(); A.go('pdv'); },
      'x-store-report': id => { const x = store(id); ui.order = { unit: x.unit }; A.go('pedidos'); },
      'x-pos-logout': () => { ui.storeSession = null; ui.posCart = []; persistSession(); A.render(); },
      'x-pos-tab': id => { ui.posTab = id; A.render(); },
      'x-pos-add': id => addCart('pos', id), 'x-shop-add': id => addCart('shop', id),
      'x-pos-remove': id => { ui.posCart.splice(Number(id), 1); A.render(); },
      'x-shop-remove': id => { ui.shopCart.splice(Number(id), 1); A.render(); },
      'x-pos-clear': () => { ui.query = ''; ui.category = ''; A.render(); },
      'x-pos-cash': () => { const session = currentSession(); F.assert(session, 'Entre no PDV.'); F.assert(F.allow(S(), 'caixa', 'edit'), 'Peça ao gerente para abrir o caixa na gestão.'); S().unit = session.unit; A.save(); A.go('caixa'); },
      'x-shop-home': () => { ui.shopStep = 'catalogo'; A.render(); },
      'x-shop-cart': () => { ui.shopStep = 'sacola'; A.render(); },
      'x-shop-checkout': () => { F.assert(ui.shopCart.length, 'Adicione uma peça à sacola.'); ui.shopStep = 'checkout'; A.render(); },
      'x-shop-orders': () => { ui.shopStep = 'pedidos'; A.render(); },
      'x-shop-category': id => { ui.shopCategory = id; A.render(); },
      'x-shop-track-order': id => { ui.shopOrder = id; ui.shopStep = 'pedidos'; A.render(); },
      'x-shop-delivered': id => { const o = S().orders.find(x => x.id === id); F.assert(o?.channel === 'E-commerce', 'Pedido não encontrado.'); A.transaction(() => C.setOrderStatus(S(), id, 'Entregue'), 'Recebimento confirmado.'); },
      'x-shop-product': id => { const p = product(id), available = pqty(id, ui.shopUnit); A.modal(esc(p.name), `<div class="shop-detail">${garment(p, true)}<div><p class="commerce-kicker">${esc(p.collection)}</p><h2>${esc(p.name)}</h2><p>${esc(p.color)} · tamanho ${esc(p.size)}</p><p class="shop-detail-price">${brl(p.price)}</p><p class="small muted">${num(available)} peças disponíveis · referência ${esc(p.ref)}</p><p class="small muted mt">Produção By Carola. Uma peça pensada para acompanhar seus dias.</p><div class="dialog-footer">${available > 0 ? b('Adicionar à sacola', 'x-shop-add-close', id, 'primary') : A.badge('Esgotado')}</div></div></div>`); },
      'x-shop-add-close': id => { addCart('shop', id); A.close(); },
      'x-order-details': orderDetails,
      'x-order-note': id => { requireEdit('fiscal'); A.transaction(() => F.issueNote(S(), id), 'Nota demonstrativa emitida. Pedido faturado.'); orderDetails(id); },
      'x-order-send': id => { requireEdit('pedidos'); A.modal('Enviar pedido · ' + esc(id), `${field('Código de rastreamento', 'trackingCode', 'BC' + id.replace(/\D/g, '') + 'BR', 'text', 'maxlength="60"')}${A.textArea('Observações do envio', 'note')}`, 'x-order-send:' + id, 'Confirmar envio'); },
      'x-order-delivered': id => { requireEdit('pedidos'); A.transaction(() => C.setOrderStatus(S(), id, 'Entregue'), 'Entrega registrada.'); },
      'x-print-receipt': id => { const o = S().orders.find(x => x.id === id); F.assert(o, 'Venda não encontrada.'); F.assert(canPrintReceipt(o), 'Sem permissão para imprimir recibos desta loja.'); A.printDoc('Comprovante · ' + o.id, `<p>${esc(A.unitName(o.unit))} · ${esc(o.client)} · vendedor ${esc(o.seller || 'Online')}</p>${A.table(['Peça', 'Quantidade', 'Preço', 'Subtotal'], o.items.map(i => `<tr><td>${esc(product(i.product).name)} · ${esc(product(i.product).color)} / ${esc(product(i.product).size)}</td><td>${i.qty}</td><td>${brl(i.price)}</td><td>${brl(i.price * i.qty)}</td></tr>`))}<h2>Total ${brl(o.total)}</h2><p>Pagamento: ${esc(o.method)} · ${esc(o.status)}</p>${o.creditApplied ? `<p>Crédito de troca ${brl(o.creditApplied)} · diferença ${brl(o.paidDifference)}</p>` : ''}`); },
      'x-pos-return': returnEditor, 'x-rom-edit': id => romEditor(id), 'x-rom-correct': id => romEditor(id, true), 'x-rom-details': romDetails,
      'x-rom-add-row': () => $('#commerce-rom-additions').insertAdjacentHTML('beforeend', additionRow()),
      'x-rom-remove-row': (_, el) => el.closest('.rom-add-row').remove(),
      'x-orders-export': () => { F.assert(F.allow(S(), 'pedidos', 'export'), 'Sem permissão para exportar pedidos.'); const list = orderDocuments(); A.csv('pedidos_vendas.csv', ['Documento', 'Data', 'Loja', 'Cliente', 'Cidade', 'UF', 'Vendedor', 'Canal', 'Situação', 'Fiscal', 'Valor líquido ou em posse'], list.map(o => [o.id, o.date, A.unitName(o.unit), o.client, o.clientCity || '', o.clientState || '', o.seller, o.channel, o.status, o.billingStatus || '', o.virtualConsignment ? o.total : net(o)])); },
      'x-pos-export': () => { const data = posReportData(); A.csv('vendas_' + data.session.unit + '.csv', ['Loja', 'Data', 'Documento', 'Pedido de origem', 'Tipo', 'Cliente', 'Vendedor', 'Pagamento', 'Peças', 'Valor líquido'], data.rows.map(row => [A.unitName(data.session.unit), row.date, row.id, row.orderId, row.type, row.client, row.seller || '', row.method || '', row.qty, row.value])); }
    });
    Object.assign(E.forms, {
      'x-orders-filter': (_, v) => {
        F.assert(F.allow(S(), 'pedidos'), 'Sem permissão para consultar pedidos.');
        const period = C.period(S(), { from: v.from || S().floor, to: v.to || F.today });
        if (v.unit) C.authorizedUnits(S(), v.unit);
        ui.order = { ...v, from: period.from, to: period.to };
        A.render();
      },
      'x-store': (form, v, id) => { requireEdit('lojas'); if (id) v.unit = store(id).unit; v.active = form.elements.active.checked; A.transaction(() => C.upsertStore(S(), v, id), 'Loja e acessos salvos.'); },
      'x-pos-login': (form, v) => { F.assert(permittedStores().some(x => x.id === v.storeId), 'Loja não autorizada para esta demonstração.'); ui.storeSession = C.authenticateStore(S(), v.storeId, v.login, v.password); ui.posCart = []; ui.posTab = 'venda'; persistSession(); A.render(); A.toast('PDV aberto: ' + store(v.storeId).name); },
      'x-pos-search': (_, v) => { ui.query = v.q; ui.category = v.category; const exact = stockProducts(posUnit()).find(p => p.barcode === v.q.trim()); if (exact) addCart('pos', exact.id); else A.render(); },
      'x-pos-report': (_, v) => { F.assert(v.from <= v.to, 'A data inicial deve ser anterior à final.'); ui.posReport = v; A.render(); },
      'x-pos-checkout': (_, v) => { const session = currentSession(); F.assert(session, 'Entre no PDV.'); F.assert(ui.posCart.length, 'Adicione ao menos uma peça.'); const total = cartTotal(ui.posCart), discount = F.number(v.discount || 0); F.assert(discount <= total * .15 || session.role === 'Gerente', 'Desconto acima de 15% requer acesso do gerente.'); let order; const cash = S().cash.find(c => c.unit === session.unit && c.open && c.users.includes(session.userId)); F.assert(cash, 'Abra um caixa autorizado para este operador.'); A.transaction(() => { order = C.checkout(S(), { ...v, unit: session.unit, items: ui.posCart, seller: S().users.find(u => u.id === v.sellerId)?.name || session.name, channel: 'Loja física', storeId: session.storeId, session, cashId: cash.id, cashSession: cash.session }); }, 'Venda concluída e registrada na loja.'); ui.posCart = []; A.render(); orderDetails(order.id); },
      'x-shop-search': (_, v) => { ui.shopQuery = v.q; A.render(); },
      'x-shop-track': (_, v) => { F.assert(S().orders.some(o => o.id.toLowerCase() === v.id.trim().toLowerCase() && o.channel === 'E-commerce'), 'Pedido online não encontrado. Confira o número.'); ui.shopOrder = S().orders.find(o => o.id.toLowerCase() === v.id.trim().toLowerCase()).id; A.render(); },
      'x-shop-checkout': (_, v) => { F.assert(ui.shopCart.length, 'Adicione peças à sacola.'); let order; A.transaction(() => { order = C.checkout(S(), { ...v, unit: ui.shopUnit, items: ui.shopCart, discount: 0, seller: 'Loja online', sellerId: '', channel: 'E-commerce', shippingAddress: `${v.address}, ${v.addressNumber} · ${v.clientCity}/${v.clientState} · CEP ${v.zip}`, storeId: S().stores.find(x => x.unit === ui.shopUnit)?.id }); }, 'Pedido confirmado. Obrigado pela sua compra!'); ui.shopCart = []; ui.shopOrder = order.id; ui.shopStep = 'pedidos'; A.render(); },
      'x-order-send': (_, v, id) => { requireEdit('pedidos'); A.transaction(() => { const o = C.setOrderStatus(S(), id, 'Enviado'); o.trackingCode = v.trackingCode.trim(); o.shippingNote = v.note; }, 'Pedido enviado. Rastreamento disponível na loja.'); },
      'x-rom-edit': (form, v, id) => { const r = S().consignments.find(x => x.id === id); if (A.route !== 'pdv') requireEdit('consignacoes'); else F.assert(currentSession()?.unit === r.unit, 'Acesso restrito à loja do PDV.'); const additions = [...form.querySelectorAll('.rom-add-row')].map(row => ({ product: row.querySelector('[name=addProduct]').value, qty: Number(row.querySelector('[name=addQty]').value) })).filter(i => i.product && i.qty > 0); const returns = r.items.map((i, n) => ({ product: i.product, qty: Number(v['returned' + n] || 0) })).filter(i => i.qty); A.transaction(() => C.updateConsignment(S(), id, { additions, returns, reason: v.reason }), 'Romaneio atualizado com registro das movimentações.'); },
      'x-rom-correct': (_, v, id) => { const r = S().consignments.find(x => x.id === id); if (A.route !== 'pdv') requireEdit('consignacoes'); else F.assert(currentSession()?.unit === r.unit, 'Acesso restrito à loja do PDV.'); const returns = r.items.map((i, n) => ({ product: i.product, qty: -Number(v['returned' + n] || 0) })).filter(i => i.qty); A.transaction(() => C.updateConsignment(S(), id, { additions: [], returns, reason: v.reason }), 'Correção registrada sem apagar o histórico.'); },
      'x-pos-return': doReturn
    });
    E.afterRender.push(() => {
      const retail = A.route === 'pdv', shop = A.route === 'loja';
      document.body.classList.toggle('environment-retail', retail); document.body.classList.toggle('environment-shop', shop); document.body.classList.toggle('commerce-environment', retail || shop);
      document.querySelectorAll('form[data-form^="x-"] [name="installments"]').forEach(el => {
        const enabled = ['Cartão', 'Boleto'].includes(el.form.elements.method?.value);
        el.disabled = !enabled;
        if (!enabled) el.value = '1';
      });
      if (retail && currentSession()?.role === 'Vendedor') {
        const seller = document.querySelector('form[data-form="x-pos-checkout"] [name="sellerId"]');
        if (seller) seller.disabled = true;
      }
    });
    document.addEventListener('change', e => {
      const el = e.target;
      try {
        if (el.dataset.commerceChange === 'login-store') { ui.loginStore = el.value; A.render(); }
        if (el.name === 'method' && el.form?.dataset.form?.startsWith('x-')) {
          const installments = el.form.elements.installments;
          if (installments) { installments.disabled = !['Cartão', 'Boleto'].includes(el.value); if (installments.disabled) installments.value = '1'; }
        }
        if (el.dataset.commerceQty) {
          const which = el.dataset.commerceQty, cart = which === 'pos' ? ui.posCart : ui.shopCart, i = Number(el.dataset.index), qty = F.qty(el.value, 1), unit = which === 'pos' ? posUnit() : ui.shopUnit;
          F.assert(qty <= F.at(S(), cart[i].product, unit), 'Quantidade acima do estoque disponível.'); cart[i].qty = qty; A.render();
        }
      } catch (err) { A.toast(err.message, true); if (el.dataset.commerceQty) A.render(); }
    });
    document.addEventListener('input', e => { if (e.target.dataset.commerceInput === 'pos-discount' && $('#retail-total')) $('#retail-total').textContent = brl(Math.max(0, cartTotal(ui.posCart) - Number(e.target.value || 0))); });
    root.CarolaCommerce = { ui, currentSession, storeEditor, orderDetails, romEditor };
  });
})(window);
