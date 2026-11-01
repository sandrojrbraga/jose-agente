import {defaults,migrate,validate,inSchedule,demand,nextOffset,plan} from './core.mjs';
import {auditSaipos,auditIfood} from './diagnostics.mjs';
let running=false;
const get=async()=>{const d=await chrome.storage.local.get(['config','states','logs','status']);return {config:migrate(d.config),states:d.states||{},logs:d.logs||[],status:d.status||{}};};
async function log(event){const {logs}=await get();await chrome.storage.local.set({logs:[{at:new Date().toISOString(),...event},...logs].slice(0,250)});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function bind(kind,id,tabId){const {config}=await get();const item=config[kind].find(x=>x.id===id);if(item)item.tabId=tabId;await chrome.storage.local.set({config});}
async function send(tabId,m){
  if(!Number.isInteger(tabId))throw Error('Vincule uma aba aberta nas configurações.');
  const tab=await chrome.tabs.get(tabId);
  const origin=m.type==='SAIPOS_READ'?'https://conta.saipos.com/':'https://portal.ifood.com.br/';
  if(!tab.url?.startsWith(origin))throw Error('Aba fechada ou endereço diferente do autorizado.');
  try {
    const r=await chrome.tabs.sendMessage(tabId,m);
    if(r)return r;
    if(m.type==='JOSE_EXECUTE')throw Error('Resultado do comando desconhecido. Use Revalidar, sem reenviar.');
  }catch(e){
    if(m.type==='JOSE_EXECUTE'&&!/Receiving end does not exist|Could not establish connection/i.test(e.message))throw e;
  }
  const files=m.type==='SAIPOS_READ'?['saipos-reader.js','saipos.js']:['ifood-dom.js','ifood.js'];
  await chrome.scripting.executeScript({target:{tabId},files});
  const r=await chrome.tabs.sendMessage(tabId,m);
  if(!r)throw Error('Leitor não respondeu mesmo após reconexão. Confira acesso ao site.');
  return r;
}
async function verifyReload(target,expected){
  await chrome.tabs.reload(target.tabId);
  for(let i=0;i<30;i++){
    await delay(500);const tab=await chrome.tabs.get(target.tabId);
    if(tab.status!=='complete')continue;
    try{return await send(target.tabId,{type:'JOSE_VERIFY',target,expected});}catch(e){if(i===29)throw e;}
  }
  throw Error('Não foi possível reler o prazo depois de recarregar.');
}
async function discover(){
  const tabs=await chrome.tabs.query({url:['https://conta.saipos.com/*']});
  const rows=[];
  for(const tab of tabs){
    try{const snapshot=await send(tab.id,{type:'SAIPOS_READ'});rows.push({tabId:tab.id,title:tab.title,...snapshot});}
    catch(e){rows.push({tabId:tab.id,title:tab.title,error:e.message});}
  }
  return rows;
}
async function ensureAlarm(){const {config}=await get();await chrome.alarms.create('jose-tick',{periodInMinutes:Math.max(30,config.intervalSeconds)/60});}
async function tick(manual=false){
  if(running)return {busy:true};running=true;
  try {
    const d=await get(),c=validate(d.config),states=d.states;
    if(c.profile?.role==='executor'){await chrome.storage.local.set({status:{...d.status,message:'Perfil iFood: testes disponíveis; comunicação com o perfil Saipos ainda não conectada.'}});return;}
    if(c.profile?.role==='reader')c.mode='simulate';
    if(!c.enabled&&(!manual||c.mode==='live')){await chrome.storage.local.set({status:{...d.status,message:'Pausado — clique Consultar agora para diagnóstico em simulação'}});return;}
    if(!inSchedule(Date.now(),c)&&(!manual||c.mode==='live')){for(const s of Object.values(states))s.lowerCount=0;await chrome.storage.local.set({states,status:{at:Date.now(),message:'Fora do horário programado'}});return;}
    const sources={};
    for(const s of c.sources){
      try {
        let r;
        try {r=await send(s.tabId,{type:'SAIPOS_READ'});}catch{}
        if(!r||r.storeId!==s.storeId){
          const candidates=await chrome.tabs.query({url:['https://conta.saipos.com/*']});
          const matches=[];
          for(const tab of candidates){try{const v=await send(tab.id,{type:'SAIPOS_READ'});if(v.storeId===s.storeId)matches.push({tabId:tab.id,snapshot:v});}catch{}}
          if(matches.length!==1)throw Error('Vincule exatamente uma aba Saipos com este ID; ela pode estar fechada, duplicada ou em outro perfil.');
          s.tabId=matches[0].tabId;r=matches[0].snapshot;
          await bind('sources',s.id,s.tabId);
        }
        sources[s.id]={...r,age:demand(r,c)};
      }
      catch(e){sources[s.id]={error:e.message};}
    }
    const results=[];
    for(const t of c.targets.filter(t=>t.enabled)){
      const key=c.mode+':'+t.id,st=states[key]||{};
      try {
        if(st.pending)throw Error('Resultado anterior pendente. Use Revalidar antes de outro envio.');
        const source=sources[t.sourceId];if(!source||source.error){st.lowerCount=0;states[key]=st;throw Error(source?.error||'Sem fonte.');}
        const desired=demand(source,c),next=nextOffset(desired,st,c),rows=plan(t,next.offset);
        if(c.mode==='simulate'){
          // Simulação não muda o Portal nem o estado de execução real.
          states[key]={...next};results.push({id:t.id,name:t.name,mode:c.mode,productionMinutes:desired,rows});continue;
        }
        if(!(await get()).config.enabled||!inSchedule(Date.now(),c))break;
        let bound;try{bound=await chrome.tabs.get(t.tabId);}catch{}
        if(!bound?.url?.startsWith('https://portal.ifood.com.br/merchant-delivery-core-portal-experience')){
          const candidates=await chrome.tabs.query({url:['https://portal.ifood.com.br/merchant-delivery-core-portal-experience*']});
          if(!candidates.length)throw Error('Abra a tela de entrega do Portal iFood neste perfil.');
          t.tabId=candidates[0].id;await bind('targets',t.id,t.tabId);
        }
        const job={type:'JOSE_EXECUTE',id:crypto.randomUUID(),target:t,rows,expiresAt:source.capturedAt+c.staleSeconds*1000};
        // Persistir antes do primeiro efeito externo; recuperação nunca reenvia às cegas.
        states[key]={...st,pending:{job,offset:next.offset,lowerCount:next.lowerCount}};
        await chrome.storage.local.set({states});
        const r=await send(t.tabId,job);
        if(!r.ok){if(!r.uncertain){delete states[key].pending;await chrome.storage.local.set({states});}throw Error(r.error||'Envio não confirmado.');}
        states[key].pending.expected=r.expected;
        await chrome.storage.local.set({states});
        if(!r.unchanged){const check=await verifyReload(t,r.expected);if(!check.ok)throw Error(check.error||'Prazo não confirmado após recarga.');}
        states[key]={...next};
        results.push({id:t.id,name:t.name,mode:c.mode,productionMinutes:desired,rows,verified:true});
        await log({storeId:t.id,type:r.unchanged?'unchanged':'saved',jobId:job.id,before:r.before,after:r.expected});
      }catch(e){if(states[key])states[key].lowerCount=0;results.push({id:t.id,name:t.name,error:e.message});await log({storeId:t.id,type:'blocked',error:e.message});}
      await chrome.storage.local.set({states});
    }
    const status={at:Date.now(),message:results.length?'Ciclo concluído':'Habilite pelo menos um destino para simular.',sources,results};
    await chrome.storage.local.set({status});
    await chrome.action.setBadgeText({text:results.some(r=>r.error)?'!':c.mode==='live'?'ON':'SIM'});
    await chrome.action.setBadgeBackgroundColor({color:results.some(r=>r.error)?'#b42318':'#176b52'});
    return status;
  }catch(e){await chrome.storage.local.set({status:{at:Date.now(),message:e.message,error:true}});return {error:e.message};}
  finally{running=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='jose-tick')tick();});
chrome.runtime.onInstalled.addListener(async()=>{const {config}=await get();await chrome.storage.local.set({config});await ensureAlarm();});
chrome.runtime.onStartup.addListener(async()=>{await ensureAlarm();await tick();});
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  // Apenas páginas internas da extensão podem controlar o executor.
  if(s.id!==chrome.runtime.id||!s.url?.startsWith(chrome.runtime.getURL('')))return;
  (async()=>{
    if(m.type==='STATE')return get();
    if(m.type==='TEST_SAIPOS'||m.type==='TEST_IFOOD'){
      if(running)throw Error('Aguarde o ciclo atual.');running=true;
      try{
        const d=await get(),start=Date.now(),tests=(await chrome.storage.local.get(['tests'])).tests||{};
        let result,attemptTabId=null,observedName='';
        try{
          const target=d.config.targets.find(t=>t.id===String(m.targetId));
          if(!target)throw Error('Escolha a loja para o teste.');
          if(m.type==='TEST_SAIPOS'){
            const source=d.config.sources.find(s=>s.id===target.sourceId);
            if(!source)throw Error('Vincule a cozinha Saipos deste cadastro antes de testar.');
            let snapshot,tabId=m.tabId??source.tabId;
            if(Number.isInteger(tabId)){attemptTabId=tabId;snapshot=await send(tabId,{type:'SAIPOS_READ'});}
            else{
              const found=(await discover()).filter(r=>r.storeId===source.storeId&&r.complete&&!r.error);
              if(found.length!==1)throw Error(found.length?'Mais de uma aba da mesma cozinha: selecione uma aba na configuração e salve.':'Nenhuma aba desta cozinha disponível neste perfil. Abra o Kanban e use Detectar.');
              snapshot=found[0];tabId=found[0].tabId;attemptTabId=tabId;
            }
            result={...auditSaipos(snapshot,source,d.config),tabId,sourceId:source.id};
          }else{
            let tabId=m.tabId??target.tabId;
            if(!Number.isInteger(tabId)){
              const found=await chrome.tabs.query({url:['https://portal.ifood.com.br/merchant-delivery-core-portal-experience*']});
              if(found.length!==1)throw Error(found.length?'Escolha uma aba iFood na configuração e salve antes de testar.':'Abra a tela de entrega do iFood neste perfil.');
              tabId=found[0].id;
            }
            attemptTabId=tabId;
            const snapshot=await send(tabId,{type:'JOSE_INSPECT'});observedName=snapshot.name||'';
            result={...auditIfood(snapshot,target,tests.saipos,d.config),tabId};
          }
        }catch(e){result={ok:false,error:e.message,readAt:Date.now(),tabId:attemptTabId,observedName,expectedStoreId:String(m.targetId)};}
        result.latencyMs=Date.now()-start;
        const key=m.type==='TEST_SAIPOS'?'saipos':'ifood';tests[key]=result;
        await chrome.storage.local.set({tests});return result;
      }finally{running=false;}
    }
    if(m.type==='TEST_RESULTS')return (await chrome.storage.local.get(['tests'])).tests||{};
    if(m.type==='DISCOVER'){
      if(running)throw Error('Aguarde o ciclo atual.');running=true;
      try{
        const readings=await discover(),d=await get();
        const valid=readings.filter(r=>r.complete&&!r.error);
        for(const r of valid){
          if(valid.filter(x=>x.storeId===r.storeId).length!==1)continue;
          let source=d.config.sources.find(s=>s.storeId===r.storeId);
          if(!source&&d.config.sources.length<5){source={id:'saipos-'+r.storeId,name:'Cozinha Saipos '+r.storeId,storeId:r.storeId,tabId:null};d.config.sources.push(source);}
          if(source)source.tabId=r.tabId;
        }
        await chrome.storage.local.set({config:d.config,status:{...d.status,discovery:readings}});
        return {ok:true,readings,config:d.config};
      }finally{running=false;}
    }
    if(m.type==='OPEN_TAB'){
      const url=m.site==='saipos'?'https://conta.saipos.com/#/app/sale/delivery/kanban/search-customer':m.site==='ifood'?'https://portal.ifood.com.br/merchant-delivery-core-portal-experience':null;
      if(!url)throw Error('Site não autorizado.');
      const tab=await chrome.tabs.create({url});return {ok:true,tabId:tab.id};
    }
    if(m.type==='TABS')return chrome.tabs.query({url:['https://conta.saipos.com/*','https://portal.ifood.com.br/*']});
    if(m.type==='SAVE'){
      if(running)throw Error('Aguarde o ciclo atual antes de salvar.');
      const config=validate(m.config),d=await get();
      if(Object.values(d.states).some(s=>s.pending))throw Error('Revalide os resultados pendentes antes de mudar a configuração.');
      await chrome.storage.local.set({config,states:{}});await ensureAlarm();return {ok:true};
    }
    if(m.type==='PAUSE'){const {config}=await get();config.enabled=false;await chrome.storage.local.set({config});return {ok:true,message:running?'Pausado; uma operação já enviada pode terminar.':'Pausado'};}
    if(m.type==='TICK')return tick(true);
    if(m.type==='READ_PORTAL'){
      if(running)throw Error('Aguarde o ciclo atual.');
      running=true;try{return await send(m.target.tabId,{type:'JOSE_READ',target:m.target});}finally{running=false;}
    }
    if(m.type==='REVERIFY'){
      if(running)throw Error('Ciclo em execução.');running=true;
      try{
        const d=await get();let count=0;
        for(const [key,s] of Object.entries(d.states))if(s.pending){
          const p=s.pending;
          const expected=p.expected||p.job.rows.map(b=>({...b,fee:p.job.target.feeMode==='preserve'?null:b.fee}));
          const check=await send(p.job.target.tabId,{type:'JOSE_VERIFY',target:p.job.target,expected});
          if(!check.ok)throw Error(check.error||'Valores ainda não conferem. Não houve reenvio.');
          d.states[key]={offset:p.offset,lowerCount:p.lowerCount};count++;
        }
        await chrome.storage.local.set({states:d.states});return {ok:true,count};
      }finally{running=false;}
    }
    throw Error('Comando desconhecido.');
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});
