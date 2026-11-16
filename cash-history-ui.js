/* Consulta dos fechamentos preservados de cada sessão de caixa. */
(()=>{'use strict';
const E=window.CarolaExtensions;
E.installers.push(A=>{
 const H=window.CarolaCashHistory,F=A.F;
 const {esc,brl,dt,button,input,select,table,stat,badge}=A;
 const ui={view:'current',from:F.month,to:F.today,cashId:'',unit:A.state.unit};
 const s=()=>A.state;
 const canRead=()=>F.assert(F.allow(s(),'caixa','view'),'Seu usuário não tem acesso aos caixas.');
 const value=n=>typeof n==='number'&&Number.isFinite(n)?brl(n):'—';
 const date=d=>d?dt(String(d).slice(0,10)):'—';
 const closedDate=row=>row.closedAt?new Date(row.closedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):date(row.closedDate);
 const rows=()=>H.list(s(),{from:ui.from,to:ui.to,cashId:ui.cashId,unit:s().unit});
 const sum=(list,key)=>list.reduce((n,r)=>n+(typeof r[key]==='number'?r[key]:0),0);
 const showHistory=(cashId='')=>{canRead();ui.view='closed';ui.cashId=cashId;A.render()};
 E.beforeRender.push(()=>{H.ensureState(s());if(ui.unit!==s().unit){ui.unit=s().unit;ui.cashId=''}});
 ['x-cash-current','x-cash-closed','x-cash-all-dates','x-cash-closing','x-cash-events','cash-history'].forEach(a=>E.readActions.add(a));
 E.views.caixa=()=>{
  const head=A.header('Unidade atual: '+A.unitName(s().unit),button('Histórico de caixas fechados','x-cash-closed','','','ponto')+button('Cadastrar caixa','cash-new','','primary','plus'));
  const tabs=`<div class="tabs" aria-label="Consulta de caixas"><button type="button" class="tab ${ui.view==='current'?'active':''}" data-action="x-cash-current">Caixas da unidade</button><button type="button" class="tab ${ui.view==='closed'?'active':''}" data-action="x-cash-closed">Histórico de fechamentos</button></div>`;
  if(ui.view==='current')return head+tabs+A.original('view','caixa').replace(/^<header[\s\S]*?<\/header>/,'');
  const found=rows(),cashOptions=[['','Todos os caixas da unidade'],...s().cash.filter(c=>c.unit===s().unit).map(c=>[c.id,c.name])];
  for(const r of found)if(!cashOptions.some(([id])=>id===r.cashId))cashOptions.push([r.cashId,r.cashName]);
  return head+tabs+`<section class="card cash-history-panel"><div class="space mb"><div><h2>Caixas já fechados</h2><p class="small muted">Consulte pela data do fechamento e abra os detalhes de cada conferência.</p></div>${badge(A.unitName(s().unit),'green')}</div><form data-form="x-cash-history-filter" class="filters cash-history-filters">${input('Data inicial','from',ui.from,'date')}${input('Data final','to',ui.to,'date')}${select('Caixa','cashId',cashOptions,ui.cashId)}<button type="submit" class="btn primary">Consultar</button>${button('Todo o histórico','x-cash-all-dates','','','reset')}<p class="form-error" role="alert"></p></form></section><div class="stats cash-history-stats">${stat('Fechamentos encontrados',found.length)}${stat('Dinheiro conferido',brl(sum(found,'counted')))}${stat('Diferenças registradas',brl(sum(found,'difference')),'Sobra (+) / falta (−)')}${stat('Conferências com diferença',found.filter(r=>typeof r.difference==='number'&&r.difference!==0).length)}</div><div class="period-caption"><span>${ui.from||ui.to?`${ui.from?date(ui.from):'Início do histórico'} a ${ui.to?date(ui.to):'Último fechamento'}`:'Todo o histórico disponível'} · ${found.length} fechamento(s)</span>${ui.cashId?button('Movimentações do caixa','x-cash-events',ui.cashId,'sm plain'):''}</div>${found.length?table(['Fechamento','Caixa / responsável','Abertura','Inicial','Dinheiro esperado','Conferido','Diferença',''],found.map(r=>`<tr><td><b>${esc(closedDate(r))}</b><small>${esc(r.session||'Sessão não registrada')}</small></td><td><b>${esc(r.cashName)}</b><small>${esc(r.closedByName||'Responsável não registrado')}</small></td><td>${date(r.openedDate)}</td><td>${value(r.opening)}</td><td>${value(r.expected)}</td><td>${value(r.counted)}</td><td><span class="${r.difference>0?'green':r.difference<0?'red':''}">${value(r.difference)}</span></td><td>${button('Consultar','x-cash-closing',r.id,'sm')}</td></tr>`)):`<div class="empty"><p>Nenhum caixa fechado encontrado para o período selecionado.</p><p class="small muted mt">Ajuste as datas ou consulte todo o histórico. Novos fechamentos aparecem aqui automaticamente.</p></div>`}${found.some(r=>r.legacy)?'<p class="small muted mt">Nos registros antigos, os valores que não foram registrados aparecem como —.</p>':''}`;
 };
 E.actions['x-cash-current']=()=>{canRead();ui.view='current';A.render()};
 E.actions['x-cash-closed']=()=>showHistory();
 E.actions['cash-history']=id=>showHistory(id);
 E.actions['x-cash-all-dates']=()=>{canRead();ui.from='';ui.to='';A.render()};
 E.forms['x-cash-history-filter']=(form,v)=>{canRead();H.list(s(),{from:v.from,to:v.to,cashId:v.cashId,unit:s().unit});Object.assign(ui,{from:v.from,to:v.to,cashId:v.cashId});A.render()};
 E.actions['x-cash-closing']=id=>{
  canRead();const r=H.get(s(),id),methods=r.byMethod||[],sales=r.sales||[],moves=r.movements||[];
  A.modal('Fechamento · '+esc(r.cashName),`<div class="detail-grid"><div><span>Unidade</span><strong>${esc(A.unitName(r.unit))}</strong></div><div><span>Fechamento</span><strong>${esc(closedDate(r))}</strong></div><div><span>Responsável</span><strong>${esc(r.closedByName||'Não registrado')}</strong></div><div><span>Abertura</span><strong>${date(r.openedDate)}</strong></div><div><span>Sessão</span><strong>${esc(r.session||'Não registrada')}</strong></div><div><span>Vendas da sessão</span><strong>${r.salesCount===null?'Não registradas':r.salesCount}</strong></div></div><div class="cash-values cash-closing-values"><div><span>Valor inicial em dinheiro</span><strong>${value(r.opening)}</strong></div><div><span>Vendas da sessão</span><strong>${value(r.salesTotal)}</strong></div><div><span>Dinheiro esperado</span><strong>${value(r.expected)}</strong></div><div><span>Dinheiro conferido</span><strong>${value(r.counted)}</strong></div><div><span>Diferença da conferência</span><strong class="${r.difference>0?'green':r.difference<0?'red':''}">${value(r.difference)}</strong></div></div><h3 class="mb mt">Observações do fechamento</h3><p class="cash-closing-note">${esc(r.note||'Sem observações.')}</p>${methods.length?`<h3 class="mb mt">Vendas por pagamento</h3>${table(['Pagamento','Vendas','Valor das vendas','Crédito utilizado','Valor após crédito'],methods.map(m=>`<tr><td>${esc(m.method)}</td><td>${m.count}</td><td>${value(m.total)}</td><td>${value(m.creditApplied)}</td><td>${value(m.received)}</td></tr>`))}`:''}${sales.length?`<h3 class="mb mt">Vendas registradas na sessão</h3>${table(['Documento','Cliente / vendedor','Pagamento','Venda','Valor após crédito'],sales.map(o=>`<tr><td>${esc(o.id)}<small>${date(o.date)}</small></td><td>${esc(o.client)}<small>${esc(o.seller||'')}</small></td><td>${esc(o.method)}</td><td>${value(o.total)}</td><td>${value(o.received)}</td></tr>`))}`:''}${moves.length?`<h3 class="mb mt">Movimentações da sessão</h3>${table(['Data','Tipo','Valor','Motivo'],moves.map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.type)}</td><td>${value(m.amount)}</td><td>${esc(m.reason||m.note||'')}</td></tr>`))}`:''}${r.legacy?'<p class="small muted mt">Este fechamento foi recuperado do histórico anterior. Somente os dados registrados na época estão disponíveis.</p>':'<p class="small muted mt">Os valores desta conferência permanecem preservados quando o caixa é reaberto.</p>'}`);
 };
 E.actions['x-cash-events']=id=>{
  canRead();const c=s().cash.find(c=>c.id===id);F.assert(c&&F.user(s()).units.includes(c.unit),'Caixa não autorizado.');
  const events=[...(c.history||[]).map(h=>({...h,text:h.note||''})),...s().cashMoves.filter(m=>m.cashId===id).map(m=>({...m,text:m.reason||''}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  A.modal('Movimentações · '+esc(c.name),table(['Data','Evento','Valor','Observação'],events.map(h=>`<tr><td>${date(h.date)}</td><td>${esc(h.type)}</td><td>${value(h.amount)}</td><td>${esc(h.text)}</td></tr>`)));
 };
 E.forms['cash-close']=(form,v,id)=>{A.transaction(()=>H.close(s(),id,v),'Caixa fechado. A conferência foi salva no histórico.');};
 E.forms['cash-open']=(form,v,id)=>{A.transaction(()=>H.open(s(),id,v),'Caixa aberto. Os fechamentos anteriores continuam disponíveis.');};
 window.CarolaCashHistoryUI={get filters(){return {...ui}},get rows(){return rows()}};
});
})();
