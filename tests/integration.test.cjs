/* Executar com node --test tests/integration.test.cjs. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core.js');
const C = require('../integration-core.js');
const fresh = () => C.migrate(F.seed());
const clone = x => JSON.parse(JSON.stringify(x));
const only = s => {
  s.orders = []; s.titles = []; s.notes = []; s.returns = []; s.moves = [];
  F.move(s, 'p1', 'fab', 100, 'Saldo de abertura', s.floor, 'OPEN');
  return s;
};
function production() {
  return {app: 'carola-production', schema: 1,
    people: [], materials: [{id:'mp1',name:'Viscose',unit:'m',color:'Azul',composition:[{fiber:'Viscose',percent:80},{fiber:'Elastano',percent:90}],yield:{kg:10,metersPerKg:3.5,meters:35}}],
    materialEntries:[{id:'mat-entry1',materialId:'mp1',qty:35,unitCost:12,date:F.today}],
    pieces: [{id:'piece1',ref:'CAR-900',name:'Vestido teste',color:'Azul',category:'Vestido',collection:'Coleção',lot:'L-1',finished:true,stage:11,grade:[{size:'P',qty:10},{size:'M',qty:8}]}],
    stockEntries: [{id:'entry1',pieceId:'piece1',ref:'CAR-900',name:'Vestido teste',color:'Azul',date:F.today,approval:'Aprovado com observação',rows:[{size:'P',normal:7,second:2,rejected:1},{size:'M',normal:8,second:0,rejected:0}],compositionLabel:{composition:[{fiber:'Viscose',percent:80},{fiber:'Elastano',percent:90}]}}]};
}
test('migração é idempotente e preserva permissões e estado existente', () => {
  const s = fresh(), before = clone(s);
  s.users[0].permissions.lojas.edit = false;
  C.migrate(s); C.migrate(s);
  assert.equal(s.orders.length,before.orders.length);
  assert.equal(s.stores.length,3);
  assert.equal(s.users[0].permissions.lojas.edit,false);
  assert.ok(s.orders.some(o=>o.channel==='E-commerce'));
  assert.ok(s.users.every(u=>u.hr));
});
test('produção integra normal e segunda por tamanho; rejeitada só no registro; reenvio não duplica', () => {
  const s = fresh(), p = production();
  const first = C.importProduction(s,p), stateAfter = clone(s);
  const products=s.products.filter(p=>p.sourceVariantKey);
  assert.equal(first.imported,1); assert.equal(first.materials,1);
  assert.equal(products.length,3);
  assert.equal(products.reduce((n,p)=>n+F.at(s,p.id,'fab'),0),17);
  assert.equal(products.filter(p=>p.quality==='segunda').reduce((n,p)=>n+F.at(s,p.id,'fab'),0),2);
  assert.equal(s.integration.productionImports[0].lines.find(l=>l.quality==='rejeitada').qty,1);
  const material=s.products.find(p=>p.sourceMaterialKey);
  assert.deepEqual(material.composition,p.materials[0].composition);
  assert.deepEqual(material.yield,p.materials[0].yield);
  assert.equal(F.at(s,material.id,'raw'),35);
  const second=C.importProduction(s,p);
  assert.equal(second.imported,0); assert.equal(second.materials,0);
  assert.equal(s.moves.length,stateAfter.moves.length);
  assert.equal(s.products.length,stateAfter.products.length);
});
test('novos lotes da mesma variante acumulam saldo sem criar outra variante', () => {
  const s=fresh(), p=production(); C.importProduction(s,p);
  p.pieces[0].id='piece2'; p.pieces[0].lot='L-2'; p.stockEntries[0].id='entry2'; p.stockEntries[0].pieceId='piece2';
  C.importProduction(s,p);
  assert.equal(s.products.filter(p=>p.sourceVariantKey).length,3);
  assert.equal(s.products.filter(p=>p.sourceVariantKey).reduce((n,p)=>n+F.at(s,p.id,'fab'),0),34);
});
test('importação inválida reverte atomicamente produtos, entradas e sequências', () => {
  const s=fresh(), p=production(); p.stockEntries[0].rows[0].normal=-2;
  const before=clone(s);
  assert.throws(()=>C.importProduction(s,p));
  assert.deepEqual(s,before);
});
test('orçamento não movimenta estoque; faturamento e nota são etapas distintas e únicas', () => {
  const s=only(fresh());
  const o=F.budget(s,{client:'Cliente',items:[{product:'p1',qty:5}],method:'Boleto'});
  assert.equal(F.at(s,'p1','fab'),100);
  F.invoiceBudget(s,o.id);
  assert.equal(o.status,'Faturamento'); assert.equal(F.at(s,'p1','fab'),95);
  assert.equal(s.titles.filter(t=>t.orderId===o.id).length,1);
  assert.throws(()=>F.invoiceBudget(s,o.id));
  F.issueNote(s,o.id);
  assert.equal(s.orders.find(x=>x.id===o.id).status,'Pedido faturado');
  assert.equal(F.at(s,'p1','fab'),95);
  assert.throws(()=>F.issueNote(s,o.id));
  assert.equal(s.notes.length,1);
  assert.throws(()=>C.setOrderStatus(s,o.id,'Orçamento'));
});
test('online segue separação, nota, envio e entrega sem segunda baixa', () => {
  const s=only(fresh());
  const o=C.checkout(s,{unit:'fab',client:'Online',items:[{product:'p1',qty:2}],channel:'E-commerce',method:'Pix',shippingAddress:'Rua Exemplo, 10 · Curitiba/PR'});
  assert.equal(o.status,'Em separação');
  assert.equal(o.seller,'Loja online'); assert.equal(o.shippingAddress,'Rua Exemplo, 10 · Curitiba/PR');
  assert.throws(()=>C.setOrderStatus(s,o.id,'Entregue'));
  assert.throws(()=>C.setOrderStatus(s,o.id,'Enviado'));
  F.issueNote(s,o.id); C.setOrderStatus(s,o.id,'Enviado',{trackingCode:'TESTE'}); C.setOrderStatus(s,o.id,'Entregue');
  const current=s.orders.find(x=>x.id===o.id);
  assert.equal(current.status,'Entregue'); assert.equal(current.billingStatus,'Pedido faturado');
  assert.equal(F.at(s,'p1','fab'),98); assert.equal(s.titles.length,1);
  assert.equal(current.trackingCode,'TESTE');
});
test('romaneio aceita adições e correção de devolução, com movimentos compensatórios e registro', () => {
  const s=only(fresh());
  const rom=F.newConsignment(s,{rep:'ct2',items:[{product:'p1',qty:10}],due:F.offset(5),commission:12});
  C.updateConsignment(s,rom.id,{additions:[{product:'p1',qty:4}],returns:[{product:'p1',qty:3}],reason:'Acrescentar lote e conferir retorno'});
  assert.equal(rom.items[0].qty,14); assert.equal(rom.items[0].returned,3);
  assert.equal(F.at(s,'p1',rom.loc),11); assert.equal(F.at(s,'p1','fab'),89);
  C.updateConsignment(s,rom.id,{returns:[{product:'p1',qty:-1}],reason:'Uma peça retornou ao representante'});
  assert.equal(rom.items[0].returned,2); assert.equal(F.at(s,'p1',rom.loc),12);
  assert.equal(rom.ledger.length,3);
  const before=clone(s);
  assert.throws(()=>C.updateConsignment(s,rom.id,{returns:[{product:'p1',qty:-99}],reason:'Inválido'}));
  assert.deepEqual(s,before);
});
test('acerto da consignação preserva financeiro líquido de comissão e trilha de auditoria', () => {
  const s=only(fresh());
  const rom=F.newConsignment(s,{rep:'ct2',items:[{product:'p1',qty:10}],due:F.offset(5),commission:12});
  const result=F.settleConsignment(s,rom.id,[{sold:3,returned:2}]);
  assert.equal(result.net,F.round(3*289*.88));
  assert.equal(result.order.status,'Faturamento');
  assert.equal(s.titles.find(t=>t.orderId===result.order.id).amount,result.net);
  assert.equal(rom.ledger.at(-1).type,'Acerto');
  assert.equal(F.at(s,'p1',rom.loc),5);
});
test('relatório de vendas contabiliza devoluções na data do retorno e isola unidades', () => {
  const s=only(fresh());
  const old=F.sell(s,{unit:'fab',client:'Anterior',items:[{product:'p1',qty:4}],method:'Pix'}); old.date=F.offset(-2);
  F.returnSale(s,old.id,'p1',1,'Devolução hoje');
  const report=C.sales(s,{from:F.today,to:F.today,unit:'fab'});
  assert.equal(report.count,0); assert.equal(report.returned,289); assert.equal(report.total,-289);
  s.user='ana';
  const restricted=C.sales(s,{from:s.floor,to:F.today,unit:'all'});
  assert.deepEqual(restricted.units,['mar']); assert.equal(restricted.count,0);
  assert.throws(()=>C.sales(s,{unit:'fab'}));
});
test('consulta de estoque por período reconstrói abertura, entradas, saídas e fechamento', () => {
  const s=only(fresh()), from=F.offset(-2), to=F.today;
  F.move(s,'p1','fab',10,'Entrada manual',from,'REC1');
  F.move(s,'p1','fab',-7,'Venda',to,'SALE1');
  const row=C.stockPeriod(s,{from,to,unit:'fab',product:'p1'})[0];
  assert.equal(row.opening,100); assert.equal(row.entries,10); assert.equal(row.exits,7); assert.equal(row.closing,103);
  assert.equal(row.cost,103*78); assert.equal(row.value,103*289);
  assert.throws(()=>C.stockPeriod(s,{from:F.offset(-1,s.floor),to,unit:'fab'}));
});
test('metas usam saldo anterior e entradas do período, sem devoluções nem transferências internas', () => {
  const s=only(fresh()), from=F.offset(-5), to=F.offset(-3);
  F.move(s,'p1','fab',10,'Entrada manual',from,'EXT1');
  F.move(s,'p1','fab',5,'Devolução de venda',from,'DEV1');
  // Transferência dentro da fábrica: a entrada em posse do representante não é novidade.
  F.move(s,'p1','fab',-3,'Transferência interna',from,'TRANS1'); F.move(s,'p1','rep1',3,'Transferência interna',from,'TRANS1');
  const result=C.targetCalc(s,{from,to,unit:'fab',basis:'qty'});
  assert.equal(result.previous,100); assert.equal(result.entries,10); assert.equal(result.target,47);
  const goal=C.saveTarget(s,{from,to,unit:'fab',basis:'qty'});
  F.move(s,'p1','fab',10,'Produção',F.offset(-2),'NEW2');
  const next=C.targetCalc(s,{from:F.offset(-2),to:F.today,unit:'fab',basis:'qty'});
  assert.equal(next.previousGoalId,goal.id); assert.equal(next.previous,115); assert.equal(next.entries,10); assert.equal(next.target,53);
  assert.throws(()=>C.saveTarget(s,{from,to:F.offset(-2),unit:'fab',basis:'qty'}));
});
test('cadastro de loja cria unidade, caixa e acessos individuais; autenticação distingue gerente e vendedor', () => {
  const s=fresh();
  const st=C.upsertStore(s,{name:'Loja teste',city:'Londrina',state:'pr',managerId:'vin',sellerId:'ana',managerLogin:'gerente',managerPassword:'1234',sellerLogin:'vendedor',sellerPassword:'5678'});
  assert.ok(s.units.some(u=>u.id===st.unit)); assert.ok(s.locations.some(l=>l.id===st.unit)); assert.ok(s.cash.some(c=>c.unit===st.unit));
  assert.equal(C.authenticateStore(s,st.id,'vendedor','5678').role,'Vendedor');
  assert.equal(C.authenticateStore(s,st.id,'gerente','1234').role,'Gerente');
  assert.throws(()=>C.authenticateStore(s,st.id,'vendedor','errada'));
  assert.throws(()=>C.authenticateStore(s,st.id,'gerente','5678'));
});
test('PDV respeita loja, vendedor, limite de desconto e gera parcelas cuja soma bate com venda', () => {
  const s=fresh(), st=s.stores.find(x=>x.unit==='mar');
  const session=C.authenticateStore(s,st.id,'vendedor','vendedor123');
  const beforeUser=s.user, beforeUnit=s.unit;
  const count=F.at(s,'p1','mar');
  const o=C.checkout(s,{storeId:st.id,session,unit:'mar',client:'Ana cliente',clientCity:'Londrina',clientState:'PR',items:[{product:'p1',qty:2}],channel:'Loja física',method:'Cartão',installments:3,discount:10});
  assert.equal(o.unit,'mar'); assert.equal(o.sellerId,'ana'); assert.equal(o.storeId,st.id);
  assert.equal(F.at(s,'p1','mar'),count-2);
  assert.equal(s.user,beforeUser); assert.equal(s.unit,beforeUnit);
  const titles=s.titles.filter(t=>t.orderId===o.id); assert.equal(titles.length,3); assert.equal(F.round(titles.reduce((n,t)=>n+t.amount,0)),o.total);
  assert.equal(s.customers.find(c=>c.id===o.customerId).city,'Londrina');
  assert.throws(()=>C.checkout(s,{storeId:st.id,session,items:[{product:'p1',qty:1}],channel:'Loja física',method:'Pix',discount:100}));
  assert.throws(()=>C.checkout(s,{storeId:st.id,session:{...session,storeId:'store-cia'},items:[{product:'p1',qty:1}],channel:'Loja física',method:'Pix'}));
});
test('produto vindo da produção precisa receber preço antes de entrar em uma venda', () => {
  const s=fresh(); C.importProduction(s,production());
  const p=s.products.find(p=>p.sourceVariantKey);
  assert.throws(()=>F.sell(s,{unit:'fab',client:'Cliente',items:[{product:p.id,qty:1},{product:'p1',qty:1}],method:'Pix'}));
});
test('entradas de matéria-prima atualizam custo e histórico pela data e ordem correta sem duplicar', () => {
  const s=fresh(), state=production();
  state.materialEntries=[
    {id:'mat-new',materialId:'mp1',qty:10,unitCost:16,date:F.offset(-1)},
    {id:'mat-old',materialId:'mp1',qty:5,unitCost:9,date:F.offset(-3)}
  ];
  C.importProduction(s,state);
  const p=s.products.find(p=>p.sourceMaterialKey);
  assert.equal(p.cost,16); assert.equal(F.priceAt(s,p.id,F.offset(-3)).cost,9); assert.equal(F.priceAt(s,p.id,F.offset(-1)).cost,16);
  assert.equal(F.at(s,p.id,'raw'),15);
  state.materialEntries.unshift({id:'mat-today',materialId:'mp1',qty:2,unitCost:21,date:F.today});
  C.importProduction(s,state);
  assert.equal(p.cost,21); assert.equal(F.priceAt(s,p.id).cost,21);
  assert.equal(F.at(s,p.id,'raw'),17);
  assert.equal(s.moves.find(m=>m.ref==='material-entry:mat-today').cost,21);
  const histories=p.prices.length;
  C.importProduction(s,state);
  assert.equal(p.prices.length,histories); assert.equal(F.at(s,p.id,'raw'),17);
  // Uma entrada antiga recebida depois não altera o custo corrente.
  state.materialEntries.unshift({id:'mat-backdated',materialId:'mp1',qty:1,unitCost:11,date:F.offset(-2)});
  C.importProduction(s,state);
  assert.equal(p.cost,21); assert.equal(F.priceAt(s,p.id,F.offset(-2)).cost,11);
  // Preço manual de venda é preservado ao atualizar o custo da matéria-prima.
  p.price=99; p.prices.push({date:F.today,price:99,cost:p.cost});
  state.materialEntries.unshift({id:'mat-after-edit',materialId:'mp1',qty:1,unitCost:23,date:F.today});
  C.importProduction(s,state);
  assert.equal(p.price,99); assert.equal(p.cost,23);
});
test('definir preço no cadastro libera venda e remove a indicação pendente sem perder origem', () => {
  const s=fresh(); C.importProduction(s,production());
  const p=s.products.find(p=>p.sourceVariantKey), before=F.at(s,p.id,'fab');
  assert.equal(p.pricePending,true);
  p.price=349; p.cost=80; p.prices.push({date:F.today,price:p.price,cost:p.cost});
  C.migrate(s);
  assert.equal(p.pricePending,false);
  const o=F.sell(s,{unit:'fab',client:'Cliente',items:[{product:p.id,qty:1}],method:'Pix'});
  assert.equal(o.total,349); assert.equal(F.at(s,p.id,'fab'),before-1); assert.equal(p.source,'production');
});
test('caixa recebe somente a diferença em dinheiro quando a troca usa crédito', () => {
  const s=fresh(), store=s.stores.find(st=>st.unit==='mar'), session=C.authenticateStore(s,store.id,'vendedor','vendedor123');
  const cash=s.cash.find(c=>c.unit==='mar'), before=F.cashExpected(s,cash.id), qty=F.at(s,'p1','mar');
  const o=C.checkout(s,{storeId:store.id,session,unit:'mar',client:'Troca',items:[{product:'p1',qty:1}],channel:'Loja física',method:'Dinheiro'});
  o.creditApplied=200; o.paidDifference=89;
  assert.equal(F.cashExpected(s,cash.id),F.round(before+89));
  assert.equal(o.total,289); assert.equal(F.at(s,'p1','mar'),qty-1);
  // Cópias antigas sem paidDifference também usam o crédito e não o total bruto.
  delete o.paidDifference;
  assert.equal(F.cashExpected(s,cash.id),F.round(before+89));
  o.creditApplied=o.total; o.paidDifference=0;
  assert.equal(F.cashExpected(s,cash.id),before);
});
test('meta bloqueia sobreposição com mesmo início ou mesmo fim e permite revisão do período idêntico', () => {
  const s=only(fresh()), from=F.offset(-10), to=F.offset(-6);
  C.saveTarget(s,{from,to,unit:'fab',basis:'qty'});
  assert.throws(()=>C.saveTarget(s,{from,to:F.offset(-5),unit:'fab',basis:'qty'}));
  assert.throws(()=>C.saveTarget(s,{from:F.offset(-9),to,unit:'fab',basis:'qty'}));
  const revised=C.saveTarget(s,{from,to,unit:'fab',basis:'qty',levels:[100,120,140,160]});
  assert.equal(revised.revision,2); assert.equal(s.targetHistory.length,2);
});
test('online integralmente devolvido não pode ser enviado ou entregue; retorno parcial preserva fluxo do saldo', () => {
  const s=only(fresh());
  const full=C.checkout(s,{unit:'fab',client:'Devolução integral',items:[{product:'p1',qty:2}],channel:'E-commerce',method:'Pix'});
  F.issueNote(s,full.id); F.returnSale(s,full.id,'p1',2,'Cliente cancelou todas as peças');
  assert.throws(()=>C.setOrderStatus(s,full.id,'Enviado'),/integralmente devolvido/);
  assert.throws(()=>C.setOrderStatus(s,full.id,'Entregue'),/integralmente devolvido/);
  const partial=C.checkout(s,{unit:'fab',client:'Devolução parcial',items:[{product:'p1',qty:3}],channel:'E-commerce',method:'Pix'});
  F.issueNote(s,partial.id); F.returnSale(s,partial.id,'p1',1,'Uma peça foi cancelada');
  C.setOrderStatus(s,partial.id,'Enviado'); C.setOrderStatus(s,partial.id,'Entregue');
  const current=s.orders.find(o=>o.id===partial.id);
  assert.equal(current.status,'Entregue'); assert.equal(current.items[0].qty-current.items[0].returned,2);
});
