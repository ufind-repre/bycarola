/* Nota de serviço recebida: somente registro fiscal e conta a pagar vinculada. */
(()=>{'use strict';
const E=window.CarolaExtensions;
E.installers.push(A=>{
 const C=window.CarolaServiceNotes,F=A.F;
 const {esc,brl,dt,button,input,select,badge,table,stat}=A;
 const state=()=>A.state;
 const ui={q:'',status:'',from:'',to:'',unit:state().unit};
 const can=(module,action='view')=>F.allow(state(),module,action);
 const requireFiscal=(action='view')=>F.assert(can('fiscal',action),'Seu usuário não tem permissão para esta operação fiscal.');
 const rows=()=>C.list(state(),{...ui,unit:state().unit});
 const tabs=()=>A.tabs([['saida','Notas de saída'],['entrada','Entrada por XML'],['servicos','Notas de serviço'],['numeracao','Numeração']],'servicos');
 function form(){
  requireFiscal('edit');
  A.modal('Registrar nota de serviço',`<div class="notice green">Ao confirmar, a nota gera uma única conta a pagar. Não há movimentação de produtos ou de estoque.</div><div class="form-grid">${input('Prestador do serviço *','person','','text','required maxlength="120"')}${input('CPF / CNPJ do prestador (opcional)','providerDocument','','text','maxlength="30"')}${input('Número da nota *','reference','','text','required maxlength="50"')}${input('Série (opcional)','series','','text','maxlength="20"')}${input('Data de emissão *','date',F.today,'date',`required max="${F.today}"`)}${input('Valor total (R$) *','amount','','number','required min="0.01" step="0.01"')}${A.textArea('Descrição do serviço *','description','')}<div class="wide"><h3 class="form-section">Conta a pagar</h3></div>${input('Vencimento *','due',F.offset(30),'date','required')}${select('Forma de pagamento','method',['Boleto','Pix','Transferência','Cartão','Dinheiro','Cheque'],'Boleto')}${input('Conta financeira *','bank','Conta principal','text','required maxlength="90"')}${A.textArea('Observações','notes','')}</div>`,'x-service-note-register','Registrar nota e gerar conta a pagar');
  document.querySelector('[data-form="x-service-note-register"] [name="description"]').required=true;
 }
 function detail(id){
  requireFiscal();const {note:n,payable:p}=C.get(state(),id);
  A.modal('Nota de serviço · '+esc(n.reference),`<div class="space mb"><strong>${esc(n.person)}</strong>${badge('Serviço','blue')}</div><div class="detail-grid"><div><span>Número / série</span><strong>${esc(n.reference)}${n.series?' / '+esc(n.series):''}</strong></div><div><span>Emissão</span><strong>${dt(n.date)}</strong></div><div><span>Valor total</span><strong>${brl(n.amount)}</strong></div><div><span>CPF / CNPJ do prestador</span><strong>${esc(n.providerDocument||'Não informado')}</strong></div><div><span>Unidade</span><strong>${esc(A.unitName(n.unit))}</strong></div><div><span>Registro fiscal</span><strong>${esc(n.id)}</strong></div></div><h3 class="mb">Descrição do serviço</h3><p class="service-note-text">${esc(n.description)}</p>${n.notes?`<h3 class="mt mb">Observações</h3><p class="service-note-text">${esc(n.notes)}</p>`:''}<section class="card mt"><div class="space mb"><h3>Conta a pagar vinculada</h3>${badge(p?.status==='Pago'?'Pago':p?.status==='Aberto'?'Em aberto':'Vínculo indisponível',p?.status==='Pago'?'green':'amber')}</div>${p?`<div class="detail-grid"><div><span>Lançamento</span><strong>${esc(p.id)}</strong></div><div><span>Valor</span><strong>${brl(p.amount)}</strong></div><div><span>Vencimento</span><strong>${dt(p.due)}</strong></div><div><span>Forma de pagamento</span><strong>${esc(p.method)}</strong></div><div><span>Conta financeira</span><strong>${esc(p.bank)}</strong></div><div><span>Pagamento</span><strong>${p.paid?dt(p.paid):'Ainda não registrado'}</strong></div></div>${can('financeiro')?button('Ver conta a pagar','x-service-note-payable',n.id,'sm primary'):''}`:'<p class="small muted">Não foi localizado o lançamento vinculado.</p>'}</section>`);
 }
 E.beforeRender.push(()=>{if(ui.unit!==state().unit){ui.unit=state().unit;ui.q=''}});
 ['x-service-note-detail','x-service-note-payable','x-service-note-clear'].forEach(action=>E.readActions.add(action));
 E.views.fiscal=()=>{
  if(A.tab.fiscal!=='servicos')return A.original('view','fiscal');
  const list=rows(),sum=items=>items.reduce((total,n)=>total+n.amount,0),open=list.filter(n=>n.payableStatus==='Aberto'),paid=list.filter(n=>n.payableStatus==='Pago');
  return A.header('Serviços recebidos e contas a pagar vinculadas.',button('Registrar nota de serviço','x-service-note-new','','primary','plus'))+tabs()+`<div class="notice green">A nota de serviço gera somente uma conta a pagar vinculada. Não altera estoque, produção, pedidos ou consignações.</div><div class="stats">${stat('Notas de serviço',list.length)}${stat('Valor na consulta',brl(sum(list)))}${stat('A pagar',brl(sum(open)))}${stat('Pago',brl(sum(paid)))}</div><form class="filters" data-form="x-service-note-filter"><label class="field search"><span>Prestador, nota ou serviço</span><input name="q" value="${esc(ui.q)}" placeholder="Buscar prestador, número da nota ou descrição"></label>${select('Conta a pagar','status',[['','Todas'],['Aberto','Em aberto'],['Pago','Pago']],ui.status)}${input('Emissão de','from',ui.from,'date')}${input('Até','to',ui.to,'date')}<button class="btn primary" type="submit">Consultar</button>${button('Limpar','x-service-note-clear')}<p class="form-error" role="alert"></p></form>${list.length?table(['Nota / prestador','Emissão','Serviço','Valor','Vencimento','Conta a pagar','Situação',''],list.map(n=>`<tr><td><b>${esc(n.reference)}${n.series?' · série '+esc(n.series):''}</b><small>${esc(n.person)}</small></td><td>${dt(n.date)}</td><td>${esc(n.description)}</td><td>${brl(n.amount)}</td><td>${n.payable?dt(n.payable.due):'—'}</td><td>${esc(n.payable?.id||'Não localizada')}</td><td>${badge(n.payableStatus==='Pago'?'Pago':n.payableStatus==='Aberto'?'Em aberto':'Não localizada',n.payableStatus==='Pago'?'green':'amber')}</td><td><div class="row">${button('Consultar','x-service-note-detail',n.id,'sm')}${can('financeiro')?button('Ver conta a pagar','x-service-note-payable',n.id,'sm plain'):''}</div></td></tr>`)):'<div class="empty"><p>Nenhuma nota de serviço encontrada.</p><p class="small muted mt">Registre uma nota de serviço ou ajuste os filtros da consulta.</p></div>'}`;
 };
 E.actions['x-service-note-new']=()=>form();
 E.actions['x-service-note-detail']=id=>detail(id);
 E.actions['x-service-note-payable']=id=>{requireFiscal();F.assert(can('financeiro'),'Seu usuário não tem acesso ao financeiro.');const {payable}=C.get(state(),id);F.assert(payable,'Conta a pagar vinculada não localizada.');A.tab.financeiro='pagar';A.filter.fin={q:payable.id,status:'',from:'',to:''};A.close();A.go('financeiro')};
 E.actions['x-service-note-clear']=()=>{requireFiscal();Object.assign(ui,{q:'',status:'',from:'',to:''});A.render()};
 E.forms['x-service-note-register']=(form,v)=>{requireFiscal('edit');A.transaction(()=>C.register(state(),v),'Nota de serviço registrada e conta a pagar gerada.')};
 E.forms['x-service-note-filter']=(form,v)=>{requireFiscal();C.list(state(),{...v,unit:state().unit});Object.assign(ui,{q:v.q.trim(),status:v.status,from:v.from,to:v.to});A.render()};
 window.CarolaServiceNotesUI={get filters(){return {...ui}},get rows(){return rows()}};
});
})();
