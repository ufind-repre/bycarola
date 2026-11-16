/* Alerta de reposição usa o saldo físico disponível, separado do consignado. */
(function(root,factory){
 'use strict';
 const F=root.Fluxo||(typeof require==='function'?require('./core.js'):null),api=factory(F);
 root.CarolaStockAlerts=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(F){
 'use strict';
 const DEFAULT_LIMIT=10;
 function threshold(product){const configured=Number(product?.min);return Math.max(DEFAULT_LIMIT,Number.isFinite(configured)?configured:0)}
 function available(s,productId,unit=s.unit){return F.round(s.locations.filter(l=>l.unit===unit&&l.type!=='materia'&&l.type!=='consignado').reduce((total,l)=>total+F.at(s,productId,l.id),0))}
 function isLow(s,product,unit=s.unit){return !!(product&&product.active!==false&&product.kind==='acabado'&&available(s,product.id,unit)<=threshold(product))}
 function ensureDemo(s){
  s.integration||={};
  if(s.integration.stockAlertDemo===1)return s;
  if(s.products.some(p=>p.sourceDemoStockAlert)){s.integration.stockAlertDemo=1;return s}
  if(!s.locations.some(l=>l.id==='fab'&&l.unit==='fab'))return s;
  return F.atomic(s,()=>{
   let id='stock-low-demo-10';if(s.products.some(p=>p.id===id))id=F.id(s,'PROD-DEMO');
   let ref='DEMO-EST-010';while(s.products.some(p=>p.ref===ref))ref='DEMO-EST-010-'+F.id(s,'REF');
   let barcode;do{barcode='299'+String(++s.sequence).padStart(10,'0')}while(s.products.some(p=>p.barcode===barcode));
   const p={id,name:'Blusa Brisa · exemplo de estoque baixo',ref,category:'Blusas',price:149.9,cost:45,color:'Oliva',size:'M',min:10,kind:'acabado',um:'peça',barcode,collection:s.settings.collection,active:true,published:false,sourceDemoStockAlert:true,prices:[{date:F.today,price:149.9,cost:45}]};
   s.products.unshift(p);
   F.move(s,p.id,'fab',10,'Saldo de abertura · exemplo de estoque baixo',F.today,'DEMO-ESTOQUE-BAIXO');
   s.integration.stockAlertDemo=1;
   F.log(s,'Exemplo de estoque baixo: Blusa Brisa · Oliva / M, com 10 peças na Fábrica.');s.activity[0].unit='fab';
   return s;
  });
 }
 return {DEFAULT_LIMIT,threshold,available,isLow,ensureDemo};
});
