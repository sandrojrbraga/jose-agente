export const VERSION = 7;
export const STORE_CATALOG = [
 ['3469536','Pizza Pizza Aquiraz'],
 ['3450370','Pizza Pizza - Jardim Cearense','p8'],
 ['3446641','Pizza Pizza Jardins Da serra'],
 ['4164721','Pizza Pizza - João Xxiii'],
 ['3288741','Pizza Pizza Maracanaú'],
 ['3148479','Pizza Pizza - Maraponga','p8'],
 ['3801484','Pizza Pizza - Oficial'],
 ['3325340','Pizza Pizza Pajuçara'],
 ['3179932','Pizza Pizza - Parangaba','p8'],
 ['3521123','Pizza Pizza - Porto das Dunas'],
 ['3521126','Pizza Pizza - Prainha']
];
export const defaults = () => ({
  version: VERSION, profile:{label:'Maraponga / P8 — teste',role:'local',targetId:'3148479'}, enabled: false, mode: 'simulate', timezone: 'America/Fortaleza',
  schedule: {days: [0,1,2,3,4,5,6], start: '14:00', end: '02:00'},
  intervalSeconds: 30, staleSeconds: 90, decreaseReadings: 2, decreaseStepMinutes: 5,
  sources: [{id:'p8', name:'P8 — cozinha compartilhada', storeId:'65416', tabId:null}],
  targets: STORE_CATALOG.map(([id,name,sourceId])=>({id,name,sourceId:sourceId||'',
    enabled:id==='3148479',tabId:null,semanticsConfirmed:false,maxMinutes:120,feeMode:'preserve',feeRules:[],timeMode:'oldest',deliveryMode:'distance',averageDeliveryMinutes:15,adjustStepMinutes:5,volumeMetric:'kitchen',volumeRules:[],maxFee:30,decreaseStepFee:1,
    bands:[.5,1,1.5,2,2.5,3,3.5,4,5,6,7].map(km=>({km,minutes:15+(km/.5-1)*5,distanceMinutes:(km/.5-1)*5,fee:null}))}))
});
export function migrate(old){
  if(!old)return defaults();
  if(old.version===VERSION)return old;
  if(old.version===6){const c=structuredClone(old);c.version=VERSION;c.enabled=false;c.mode='simulate';for(const t of c.targets){t.semanticsConfirmed=false;t.feeRules=t.feeRules||(t.volumeRules||[]).filter(r=>r.extraFee>0).map(r=>({minOrders:r.minOrders,extraFee:r.extraFee}));if(t.feeMode==='demand')t.feeMode=t.bands.every(b=>b.fee!==null)?'configured':'preserve';}return c;}
  if(![1,2,3,4,5].includes(old.version))throw Error('Versão de configuração desconhecida.');
  const c={...defaults(),...old,version:VERSION,enabled:false,mode:'simulate'};
  const fresh=defaults().targets;
  c.targets=[...fresh.map(t=>({...t,...old.targets?.find(o=>String(o.id)===t.id)})),...(old.targets||[]).filter(t=>!fresh.some(f=>f.id===String(t.id)))];
  c.profile={...defaults().profile,...old.profile,targetId:old.profile?.targetId||'3148479'};
  c.targets.forEach(t=>{t.id=String(t.id);const previous=old.targets?.find(o=>String(o.id)===t.id);t.timeMode=previous?.timeMode==='volume'?'volume':'oldest';const base=previous?.deliveryMode==='average'?previous.averageDeliveryMinutes:Math.min(...t.bands.map(b=>b.minutes));t.averageDeliveryMinutes=base;t.bands=t.bands.map(b=>({...b,distanceMinutes:previous?.deliveryMode==='average'?0:b.minutes-base}));t.deliveryMode='distance';t.adjustStepMinutes=previous?.adjustStepMinutes||5;t.feeRules=previous?.feeRules||(previous?.volumeRules||[]).filter(r=>r.extraFee>0).map(r=>({minOrders:r.minOrders,extraFee:r.extraFee}));if(t.feeMode==='demand')t.feeMode=t.bands.every(b=>b.fee!==null)?'configured':'preserve';t.semanticsConfirmed=false;t.enabled=t.enabled&&t.id===c.profile.targetId;});
  return c;
}

const fail = m => {throw new Error(m);};
const cents=n=>Math.abs(n*100-Math.round(n*100))<1e-7;
const finite = (n,min,max,label) => {
  if(typeof n !== 'number'||!Number.isFinite(n)||n<min||n>max) fail(label);
};
export function validate(c) {
  if(c.version!==VERSION||!['simulate','live'].includes(c.mode)) fail('Versão ou modo inválido.');
  if(typeof c.enabled!=='boolean') fail('Estado de execução inválido.');
  if(!c.targets?.some(t=>t.id===c.profile?.targetId))fail('Selecione a loja deste perfil.');
  if(c.targets?.some(t=>t.enabled&&t.id!==c.profile.targetId))fail('Habilite somente a loja vinculada a este perfil Chrome.');
  if(c.profile&&!['local','reader','executor'].includes(c.profile.role))fail('Papel do perfil inválido.');
  try {new Intl.DateTimeFormat('pt-BR',{timeZone:c.timezone}).format();} catch {fail('Fuso inválido.');}
  if(!Array.isArray(c.sources)||!c.sources.length||c.sources.length>5) fail('Cadastre de 1 a 5 fontes Saipos.');
  if(!Array.isArray(c.targets)||!c.targets.length||c.targets.length>11) fail('Cadastre de 1 a 11 IDs iFood.');
  const unique=(xs,key)=>new Set(xs.map(x=>String(x[key]))).size===xs.length;
  if(!unique(c.sources,'id')||!unique(c.sources,'storeId')||!unique(c.targets,'id')) fail('IDs duplicados.');
  for(const s of c.sources) {
    if(!s.id||!s.name||!/^\d+$/.test(s.storeId)) fail('Fonte: informe nome e ID numérico Saipos.');
    if(s.tabId!==null&&!Number.isInteger(s.tabId)) fail('Aba Saipos inválida.');
  }
  if(!unique(c.sources.filter(x=>x.tabId!==null),'tabId')) fail('Não vincule uma aba a duas fontes.');
  for(const t of c.targets) {
    if(!/^\d+$/.test(t.id)||!t.name) fail('Destino sem ID ou nome.');
    if(t.sourceId&&!c.sources.some(s=>s.id===t.sourceId)) fail('Destino vinculado a uma cozinha inexistente.');
    if(t.enabled&&c.mode==='live'&&!t.sourceId) fail('Vincule a cozinha Saipos de cada destino habilitado.');
    if(typeof t.enabled!=='boolean'||typeof t.semanticsConfirmed!=='boolean') fail('Validação do destino inválida.');
    if(t.tabId!==null&&!Number.isInteger(t.tabId)) fail('Aba iFood inválida.');
    if(!['preserve','configured','demand'].includes(t.feeMode)) fail('Modo da taxa inválido.');
    if(!['oldest','volume','combined'].includes(t.timeMode))fail('Escolha o cálculo por idade ou quantidade.');
    if(!['bands','average','distance'].includes(t.deliveryMode))fail('Base de entrega inválida.');
    finite(t.adjustStepMinutes,1,60,'Passo de ajuste inválido.');if(!Number.isInteger(t.adjustStepMinutes))fail('Passo de ajuste deve usar minutos inteiros.');
    if(t.deliveryMode==='average'||t.deliveryMode==='distance'){finite(t.averageDeliveryMinutes,1,t.maxMinutes,'Tempo médio de entrega fora do limite.');if(!Number.isInteger(t.averageDeliveryMinutes))fail('Tempo médio de entrega deve usar minutos inteiros.');}
    if(!['kitchen','waiting'].includes(t.volumeMetric))fail('Métrica de volume inválida.');
    finite(t.maxFee,0,1000,'Teto da taxa inválido.');
    finite(t.decreaseStepFee,0.01,1000,'Passo de redução da taxa inválido.');
    if(!cents(t.maxFee)||!cents(t.decreaseStepFee))fail('Use até duas casas decimais em valores de taxa.');
    if(!Array.isArray(t.volumeRules))fail('Regras de volume inválidas.');
    let threshold=0,extraMinutes=0;
    for(const r of t.volumeRules){
      finite(r.minOrders,1,10000,'Volume mínimo inválido.');finite(r.extraMinutes,0,1440,'Acréscimo de tempo inválido.');
      if(!Number.isInteger(r.minOrders)||!Number.isInteger(r.extraMinutes)||r.minOrders<=threshold||r.extraMinutes<extraMinutes)fail('Ordene patamares crescentes, sem reduzir tempo ou taxa ao aumentar o volume.');
      threshold=r.minOrders;extraMinutes=r.extraMinutes;
    }
    if(t.timeMode==='volume'&&!t.volumeRules.some(r=>r.extraMinutes>0))fail('Defina os minutos de preparo nos patamares por quantidade.');
    if(!Array.isArray(t.feeRules))fail('Patamares da taxa de pico inválidos.');
    let feeThreshold=0,feeExtra=0;
    for(const r of t.feeRules){finite(r.minOrders,1,10000,'Volume da taxa de pico inválido.');finite(r.extraFee,0,1000,'Acréscimo da taxa de pico inválido.');if(!Number.isInteger(r.minOrders)||r.minOrders<=feeThreshold||r.extraFee<feeExtra||!cents(r.extraFee))fail('Ordene os patamares de taxa por pedidos crescentes e valores em reais crescentes, com até duas casas decimais.');feeThreshold=r.minOrders;feeExtra=r.extraFee;}
    if(t.feeMode==='demand'&&!t.feeRules.some(r=>r.extraFee>0))fail('Defina ao menos um patamar de taxa de pico com acréscimo positivo.');
    finite(t.maxMinutes,1,1440,'Limite de prazo inválido.');
    if(!Number.isInteger(t.maxMinutes)||!Array.isArray(t.bands)||!t.bands.length) fail('Faixas ou limite inválidos.');
    let km=0;
    for(const b of t.bands) {
      if(t.deliveryMode==='distance'){finite(b.distanceMinutes,0,1440,'Adicional de distância inválido.');if(!Number.isInteger(b.distanceMinutes))fail('Use minutos inteiros no adicional por distância.');if(deliveryMinutes(t,b)>t.maxMinutes)fail('Entrega média mais distância supera o limite de prazo.');}
      finite(b.km,0.1,100,'Raio inválido.'); finite(b.minutes,1,t.deliveryMode!=='bands'?1440:t.maxMinutes,'Tempo-base fora do limite.');
      if(b.km<=km||!Number.isInteger(b.minutes)) fail('Ordene os raios e use minutos inteiros.');
      km=b.km;
      if(b.fee!==null){finite(b.fee,0,1000,'Taxa inválida.');if(!cents(b.fee))fail('Use até duas casas decimais na taxa-base.');}
      if(t.feeMode!=='preserve'&&b.fee===null) fail('Preencha todas as taxas no modo configurado.');
      if(t.feeMode==='demand'&&b.fee+(t.feeRules.at(-1)?.extraFee||0)>t.maxFee)fail('Taxa-base mais acréscimo supera o teto desta loja.');
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
export function plan(target,offset,feeOffset=0) {
  const rows=target.bands.map(b=>({...b,minutes:deliveryMinutes(target,b)+offset,fee:target.feeMode==='preserve'?null:target.feeMode==='demand'?Math.round((b.fee+feeOffset)*100)/100:b.fee}));
  if(target.feeMode==='demand'&&rows.some(b=>b.fee>target.maxFee))fail('Taxa calculada supera o teto da loja.');
  if(rows.some(b=>b.minutes>target.maxMinutes)) fail('Demanda exige prazo acima do limite configurado. Intervenção necessária; prazo mantido.');
  return rows;
}

// Todas as regras são absolutas sobre a base, nunca sobre o último valor do Portal.
export function volumeRule(target,snapshot){
  let volume=snapshot.count;
  if(!Number.isInteger(volume)||volume<0)fail('Contador de volume inválido.');
  if(target.volumeMetric==='waiting'){
    const stages=snapshot.stages||[];
    const kitchen=stages.filter(s=>s.stage==='Cozinha'),waiting=stages.filter(s=>s.stage==='Aguardando entrega');
    if(kitchen.length!==1||kitchen[0].count!==volume||waiting.length!==1||!Number.isInteger(waiting[0].count)||waiting[0].count<0)fail('Contador de aguardando entrega ausente ou inconsistente.');
    volume+=waiting[0].count;
  }
  const rule=[...(target.volumeRules||[])].reverse().find(r=>volume>=r.minOrders);
  return {volume,threshold:rule?.minOrders??null,extraMinutes:rule?.extraMinutes||0,extraFee:rule?.extraFee||0};
}
export function adjustment(target,snapshot,state,c,now=Date.now()){
  const kitchenAge=demand(snapshot,c,now),rule=volumeRule(target,snapshot);
  const productionMinutes=selectedAge(target,snapshot,c,now,kitchenAge);
  const desiredTime=timeContribution(target,productionMinutes,rule);
  const next=nextOffset(desiredTime,state,c);
  const surge=feeRule(target,snapshot);
  const fee=nextOffset(Math.round(surge.extraFee*100),
    {offset:state.feeOffsetCents,lowerCount:state.feeLowerCount},
    {...c,decreaseStepMinutes:Math.round(target.decreaseStepFee*100)});
  const nextState={...next,feeOffsetCents:fee.offset,feeLowerCount:fee.lowerCount};
  return {next:nextState,rows:plan(target,next.offset,fee.offset/100),productionMinutes,desiredTime,...rule,feeVolume:surge.volume,feeThreshold:surge.threshold,desiredFee:surge.extraFee};
}

export function deliveryMinutes(target,band){
  if(target.deliveryMode==='distance')return target.averageDeliveryMinutes+(band.distanceMinutes??band.minutes-target.averageDeliveryMinutes);
  return target.deliveryMode==='average'?target.averageDeliveryMinutes:band.minutes;
}
export function timeContribution(target,productionMinutes,rule){
  if(target.timeMode==='oldest')return productionMinutes;
  if(target.timeMode==='volume')return rule.extraMinutes;
  if(target.timeMode==='combined')return productionMinutes+rule.extraMinutes;
  fail('Modo de cálculo de tempo inválido.');
}

export function selectedAge(target,snapshot,c,now=Date.now(),kitchenAge=demand(snapshot,c,now)){
  if(target.timeMode==='volume'||target.volumeMetric!=='waiting')return kitchenAge;
  const w=snapshot.waiting;
  if(!w?.complete||w.error)fail(w?.error||'Leitura completa de Aguardando entrega necessária para calcular a idade.');
  const stage=snapshot.stages?.find(s=>s.stage==='Aguardando entrega');
  if(!stage||stage.count!==w.count)fail('Contador de Aguardando entrega inconsistente.');
  return Math.max(kitchenAge,demand({...snapshot,...w,capturedAt:snapshot.capturedAt},c,now));
}
// Um passo por ciclo, a partir do valor realmente lido no Portal.
export function stepRows(desired,current,step,instant=desired){
  if(!Array.isArray(current))fail('Tabela atual do iFood indisponível.');
  const extra=desired.filter(r=>!current.some(c=>c.km===r.km)).map(r=>r.km+' km');
  const missing=current.filter(r=>!desired.some(c=>c.km===r.km)).map(r=>r.km+' km');
  if(current.length!==desired.length||desired.some((r,i)=>r.km!==current[i]?.km))fail('Faixas do iFood e do cadastro não correspondem.'+(extra.length?' Somente no cadastro: '+extra.join(', ')+'.':'')+(missing.length?' Faltam no cadastro: '+missing.join(', ')+'.':'')+(!extra.length&&!missing.length?' Confira a ordem das distâncias.':' Revise as faixas em Parâmetros e salve.'));
  return desired.map((r,i)=>{let minutes=Math.min(current[i].minutes+step,Math.max(current[i].minutes-step,r.minutes));if(minutes>current[i].minutes)minutes=Math.min(minutes,Math.max(current[i].minutes,instant[i].minutes));return {...r,minutes};});
}

// A taxa de pico é independente da regra de tempo e conta somente Cozinha.
export function feeRule(target,snapshot){
  const volume=snapshot.count;if(!Number.isInteger(volume)||volume<0)fail('Contagem de Cozinha inválida para taxa de pico.');
  const rule=target.feeMode==='demand'?[...target.feeRules].reverse().find(r=>volume>=r.minOrders):null;
  return {volume,threshold:rule?.minOrders??null,extraFee:rule?.extraFee||0};
}
