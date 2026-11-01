export const VERSION = 1;
export const defaults = () => ({
  version: VERSION, enabled: false, mode: 'simulate', timezone: 'America/Fortaleza',
  schedule: {days: [0,1,2,3,4,5,6], start: '14:00', end: '02:00'},
  intervalSeconds: 30, staleSeconds: 90, decreaseReadings: 2, decreaseStepMinutes: 5,
  sources: [{id:'p8', name:'P8 — cozinha compartilhada', storeId:'65416', tabId:null}],
  targets: [
    {id:'3148479', name:'Pizza Pizza - Maraponga', sourceId:'p8'},
    {id:'3450370', name:'Pizza Pizza - Jardim Cearense', sourceId:'p8'},
    {id:'3179932', name:'Pizza Pizza - Parangaba', sourceId:'p8'}
  ].map(t=>({...t, enabled:false, tabId:null, semanticsConfirmed:false,
    maxMinutes:120, feeMode:'preserve',
    bands:Array.from({length:14},(_,i)=>({km:(i+1)/2,minutes:15+i*5,fee:null}))}))
});
const fail = m => {throw new Error(m);};
const finite = (n,min,max,label) => {
  if(typeof n !== 'number'||!Number.isFinite(n)||n<min||n>max) fail(label);
};
export function validate(c) {
  if(c.version!==VERSION||!['simulate','live'].includes(c.mode)) fail('Versão ou modo inválido.');
  if(typeof c.enabled!=='boolean') fail('Estado de execução inválido.');
  try {new Intl.DateTimeFormat('pt-BR',{timeZone:c.timezone}).format();} catch {fail('Fuso inválido.');}
  if(!Array.isArray(c.sources)||!c.sources.length||c.sources.length>5) fail('Cadastre de 1 a 5 fontes Saipos.');
  if(!Array.isArray(c.targets)||!c.targets.length||c.targets.length>4) fail('Cadastre de 1 a 4 IDs iFood.');
  const unique=(xs,key)=>new Set(xs.map(x=>String(x[key]))).size===xs.length;
  if(!unique(c.sources,'id')||!unique(c.sources,'storeId')||!unique(c.targets,'id')) fail('IDs duplicados.');
  for(const s of c.sources) {
    if(!s.id||!s.name||!/^\d+$/.test(s.storeId)) fail('Fonte: informe nome e ID numérico Saipos.');
    if(s.tabId!==null&&!Number.isInteger(s.tabId)) fail('Aba Saipos inválida.');
  }
  if(!unique(c.sources.filter(x=>x.tabId!==null),'tabId')) fail('Não vincule uma aba a duas fontes.');
  for(const t of c.targets) {
    if(!/^\d+$/.test(t.id)||!t.name||!c.sources.some(s=>s.id===t.sourceId)) fail('Destino sem ID, nome ou cozinha válida.');
    if(typeof t.enabled!=='boolean'||typeof t.semanticsConfirmed!=='boolean') fail('Validação do destino inválida.');
    if(t.tabId!==null&&!Number.isInteger(t.tabId)) fail('Aba iFood inválida.');
    if(!['preserve','configured'].includes(t.feeMode)) fail('Modo da taxa inválido.');
    finite(t.maxMinutes,1,1440,'Limite de prazo inválido.');
    if(!Number.isInteger(t.maxMinutes)||!Array.isArray(t.bands)||!t.bands.length) fail('Faixas ou limite inválidos.');
    let km=0;
    for(const b of t.bands) {
      finite(b.km,0.1,100,'Raio inválido.'); finite(b.minutes,1,t.maxMinutes,'Tempo-base fora do limite.');
      if(b.km<=km||!Number.isInteger(b.minutes)) fail('Ordene os raios e use minutos inteiros.');
      km=b.km;
      if(b.fee!==null) finite(b.fee,0,1000,'Taxa inválida.');
      if(t.feeMode==='configured'&&b.fee===null) fail('Preencha todas as taxas no modo configurado.');
    }
    if(c.mode==='live'&&t.enabled&&!t.semanticsConfirmed) fail('Confirme o significado do campo Tempo antes de ativar a escrita.');
  }
  finite(c.intervalSeconds,30,3600,'Intervalo mínimo: 30 segundos.');
  finite(c.staleSeconds,c.intervalSeconds,600,'Validade das leituras inválida.');
  finite(c.decreaseReadings,2,20,'Use pelo menos duas leituras para reduzir.');
  finite(c.decreaseStepMinutes,1,60,'Passo de redução inválido.');
  if(!Number.isInteger(c.decreaseReadings)||!Number.isInteger(c.decreaseStepMinutes)) fail('Redução requer valores inteiros.');
  const sch=c.schedule, clock=/^([01]\d|2[0-3]):[0-5]\d$/;
  if(!sch||!clock.test(sch.start)||!clock.test(sch.end)||sch.start===sch.end||!Array.isArray(sch.days)||!sch.days.length||sch.days.some(d=>!Number.isInteger(d)||d<0||d>6)) fail('Horário ou dias inválidos.');
  return c;
}
function localParts(now, timezone) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
  return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute};
}
export function inSchedule(now,c) {
  const p=localParts(now,c.timezone), day=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
  const m=p.hour*60+p.minute, n=s=>+s.slice(0,2)*60 + +s.slice(3), a=n(c.schedule.start),b=n(c.schedule.end);
  if(a<b) return c.schedule.days.includes(day)&&m>=a&&m<b;
  return (m>=a&&c.schedule.days.includes(day))||(m<b&&c.schedule.days.includes((day+6)%7));
}
const months={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
export function productionAge(card,now,timezone) {
  const p=localParts(now,timezone), m=card.created?.match(/(\d{1,2})\/(\w{3}),?\s*(\d{2}):(\d{2})/i);
  const s=card.since?.match(/Desde\s+(\d{2}):(\d{2})/i);
  if(!m||!s||!months[m[2].toLowerCase()]) fail('Horário de produção incompleto.');
  if(+m[3]>23||+m[4]>59||+s[1]>23||+s[2]>59) fail('Relógio inválido.');
  const localNow=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
  let creation=Date.UTC(p.year,months[m[2].toLowerCase()]-1,+m[1],+m[3],+m[4]);
  if(creation>localNow+86400000) creation=Date.UTC(p.year-1,months[m[2].toLowerCase()]-1,+m[1],+m[3],+m[4]);
  let entered=creation-(+m[3]*60 + +m[4])*60000+(+s[1]*60 + +s[2])*60000;
  if(entered<creation) entered+=86400000;
  const age=(localNow-entered)/60000;
  if(age<0||age>1440) fail('Pedido de produção futuro ou antigo demais: conferir a tela.');
  const shown=card.since.match(/\((?:(\d+)h)?\s*(?:(\d+)m)?\)/);
  if(shown&&(shown[1]||shown[2])&&Math.abs(age-(+(shown[1]||0)*60 + +(shown[2]||0)))>3) fail('Relógio da tela Saipos está desatualizado.');
  return Math.ceil(age);
}
export function demand(snapshot,c,now=Date.now()) {
  if(!snapshot||snapshot.error||snapshot.complete!==true||!Number.isFinite(snapshot.capturedAt)||snapshot.capturedAt>now+5000||now-snapshot.capturedAt>c.staleSeconds*1000) fail(snapshot?.error||'Leitura ausente, incompleta ou vencida.');
  if(snapshot.count!==snapshot.cards.length) fail('Quantidade de cartões diverge do contador.');
  return Math.max(0,...snapshot.cards.map(x=>productionAge(x,now,c.timezone)));
}
export function nextOffset(desired,state,c) {
  const previous=state.offset;
  if(previous===undefined||desired>=previous) return {offset:desired,lowerCount:0};
  const lowerCount=(state.lowerCount||0)+1;
  if(lowerCount<c.decreaseReadings) return {offset:previous,lowerCount};
  return {offset:Math.max(desired,previous-c.decreaseStepMinutes),lowerCount:0};
}
export function plan(target,offset) {
  const rows=target.bands.map(b=>({...b,minutes:b.minutes+offset}));
  if(rows.some(b=>b.minutes>target.maxMinutes)) fail('Demanda exige prazo acima do limite configurado. Intervenção necessária; prazo mantido.');
  return rows;
}
