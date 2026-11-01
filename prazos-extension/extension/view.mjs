export function connection(reading,staleSeconds,now=Date.now()){
  if(!reading)return {label:'Sem leitura',tone:'muted',note:'Aguarda conexão.'};
  if(!reading.ok)return {label:'Bloqueado',tone:'error',note:reading.error||'Falha de leitura.'};
  const age=now-reading.readAt;
  if(!Number.isFinite(age)||age< -5000||age>staleSeconds*1000)return {label:'Desatualizado',tone:'error',note:'É necessária uma leitura válida recente.'};
  return {label:'Conectado',tone:'ok',note:`Lido às ${new Date(reading.readAt).toLocaleTimeString('pt-BR')}`};
}
const values=r=>r?`${r.minutes} min · ${r.fee==null?'taxa preservada':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(r.fee)}`:'—';
export function comparisonRows(current,planned,desired=planned,logs=[],storeId){
  const kms=[...new Set([...(current||[]),...(planned||[]),...logs.filter(l=>l.storeId===storeId&&l.type==='saved').flatMap(l=>l.after||[])].map(r=>r.km))].sort((a,b)=>a-b);
  return kms.map(km=>{
    const a=current?.find(r=>r.km===km),b=planned?.find(r=>r.km===km);
    const log=logs.find(l=>l.storeId===storeId&&l.type==='saved'&&l.before?.some(p=>p.km===km)&&l.after?.some(p=>p.km===km&&p.minutes!==l.before.find(x=>x.km===km)?.minutes));
    const before=log?.before.find(r=>r.km===km),after=log?.after.find(r=>r.km===km);
    return {km,desired:values(desired?.find(r=>r.km===km)),before:before?before.minutes+' min':'—',after:after?after.minutes+' min':'—',editedAt:log?new Date(log.at).toLocaleString('pt-BR'):'—',current:values(a),proposed:values(b),label:!a?'Sem leitura iFood':!b?'Sem cálculo':a.minutes===b.minutes&&(b.fee==null||Math.round(a.fee*100)===Math.round(b.fee*100))?'Valores iguais':'Diferença — não confirma envio'};
  });
}
