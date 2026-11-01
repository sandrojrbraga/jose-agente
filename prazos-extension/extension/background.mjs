import {chooseSaipos,linkReadings} from './link-report.mjs';
import {contextStore,contextTabs,ownedTab,openContextPages,LOGIN_PAGES,resolvePortalTab} from './context.mjs';
import {defaults,migrate,validate,inSchedule,demand,adjustment,stepRows,plan} from './core.mjs';
import {auditSaipos,auditIfood} from './diagnostics.mjs';
const incognito=!!chrome.extension?.inIncognitoContext;
const storage=contextStore(chrome,incognito),queryTabs=contextTabs(chrome,incognito);
const scope=incognito?'incognito':'normal',alarmName='jose-tick:'+scope;
let running=false,opening=false;
const get=async()=>{const d=await storage.get(['config','states','logs','status','portal','timeEdits']);return {config:migrate(d.config),states:d.states||{},logs:d.logs||[],status:d.status||{},portal:d.portal||null,timeEdits:d.timeEdits||{},context:scope};};
async function log(event){const {logs}=await get();await storage.set({logs:[{at:new Date().toISOString(),...event},...logs].slice(0,250)});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function bind(kind,id,tabId){const {config}=await get();const item=config[kind].find(x=>x.id===id);if(item)item.tabId=tabId;await storage.set({config});}
async function send(tabId,m){
  if(!Number.isInteger(tabId))throw Error('Vincule uma aba aberta nas configurações.');
  const tab=await ownedTab(chrome,tabId,incognito);
  const origin=m.type==='SAIPOS_READ'?'https://conta.saipos.com/':'https://portal.ifood.com.br/';
  if(!tab.url?.startsWith(origin))throw Error('Aba fechada ou endereço diferente do autorizado.');
  // Homologar protocolo antes de qualquer comando com efeito: abas antigas podem ter leitor anterior.
  if(m.type!=='SAIPOS_READ'&&m.type!=='JOSE_INSPECT')await send(tabId,{type:'JOSE_INSPECT'});
  try {
    const r=await chrome.tabs.sendMessage(tabId,m);
    if(r&&(m.type!=='JOSE_INSPECT'||r.readerVersion===9)&&(m.type!=='SAIPOS_READ'||r.readerVersion===4))return r;
    if(m.type==='JOSE_EXECUTE')throw Error('Resultado do comando desconhecido. Use Revalidar, sem reenviar.');
  }catch(e){
    if(m.type==='JOSE_EXECUTE'&&!/Receiving end does not exist|Could not establish connection/i.test(e.message))throw e;
  }
  const files=m.type==='SAIPOS_READ'?['saipos-reader.js','saipos.js']:['ifood-dom.js','ifood.js'];
  await chrome.scripting.executeScript({target:{tabId},files});
  const r=await chrome.tabs.sendMessage(tabId,m);
  if(!r||(m.type==='JOSE_INSPECT'&&r.readerVersion!==9)||(m.type==='SAIPOS_READ'&&r.readerVersion!==4))throw Error('Leitor não respondeu na versão atual. Recarregue a aba do site.');
  return r;
}
async function verifyReload(target,expected){
  await ownedTab(chrome,target.tabId,incognito);
  await chrome.tabs.reload(target.tabId);
  for(let i=0;i<30;i++){
    await delay(500);const tab=await ownedTab(chrome,target.tabId,incognito);
    if(tab.status!=='complete')continue;
    try{return await send(target.tabId,{type:'JOSE_VERIFY',target:{...target,profilePinned:true},expected});}catch(e){if(i===29)throw e;}
  }
  throw Error('Não foi possível reler o prazo depois de recarregar.');
}
async function discover(){
  const tabs=await queryTabs({url:['https://conta.saipos.com/*']});
  const rows=[];
  for(const tab of tabs){
    try{const snapshot=await send(tab.id,{type:'SAIPOS_READ'});rows.push({tabId:tab.id,title:tab.title,...snapshot});}
    catch(e){rows.push({tabId:tab.id,title:tab.title,error:e.message});}
  }
  return rows;
}
// Leitura direta da aba vinculada: não abre seletor, não preenche e não salva.
async function readPortal(c){
  const start=Date.now(),target=c.targets.find(t=>t.id===c.profile.targetId);let tabId=target?.tabId;
  try{
    if(!target)throw Error('Cadastre a loja deste perfil.');
    const resolved=await resolvePortalTab(chrome,incognito,target);tabId=resolved.tab.id;
    const snapshot=await send(tabId,{type:'JOSE_INSPECT'});
    const r=auditIfood(snapshot,target,null,c);
    if(resolved.recovered){await bind('targets',target.id,tabId);target.tabId=tabId;await log({storeId:target.id,type:'reconnected',site:'ifood',previousTabId:resolved.previousTabId,tabId});}
    const result={...r,targetId:target.id,tabId,reconnected:resolved.recovered,latencyMs:Date.now()-start};
    await storage.set({portal:result});return result;
  }catch(e){const result={ok:false,error:e.message,readAt:Date.now(),targetId:target?.id,tabId,latencyMs:Date.now()-start};await storage.set({portal:result});return result;}
}
async function reconcilePending(d,key,automatic=false){
  const p=d.states[key].pending;
  if(automatic&&p.lastVerifyAt&&Date.now()-p.lastVerifyAt<60000)throw Error('Aguardando nova conferência automática do envio pendente; nenhum reenvio será feito.');
  p.lastVerifyAt=Date.now();p.stage='verifying';await storage.set({states:d.states});
  try{
    const expected=p.expected||p.job.rows.map(b=>({...b,fee:p.job.target.feeMode==='preserve'?null:b.fee}));
    const saved=d.config.targets.find(t=>t.id===p.job.target.id);
    if(!saved||d.config.profile.targetId!==p.job.target.id)throw Error('O envio pendente pertence a outra loja. Nenhuma revalidação foi realizada.');
    const resolved=await resolvePortalTab(chrome,incognito,{...p.job.target,tabId:saved.tabId});
    const target={...p.job.target,tabId:resolved.tab.id,profilePinned:true};
    // Nunca descartar um formulário sujo: a conferência é somente de leitura.
    auditIfood(await send(target.tabId,{type:'JOSE_INSPECT'}),target,null,d.config);
    if(saved.tabId!==target.tabId)await bind('targets',target.id,target.tabId);
    p.job.target=target;await storage.set({states:d.states});
    const check=await verifyReload(target,expected);
    if(!check.ok)throw Error(check.error||'Valores persistidos não conferem com o envio pendente. Nenhum comando foi reenviado.');
    d.states[key]={offset:p.offset,lowerCount:p.lowerCount,feeOffsetCents:p.feeOffsetCents,feeLowerCount:p.feeLowerCount};
    await storage.set({states:d.states});
    const at=new Date().toISOString(),timeEdits=(await get()).timeEdits;
    for(const row of expected){const before=p.before?.find(b=>b.km===row.km);if(before&&before.minutes!==row.minutes){timeEdits[target.id]||={};timeEdits[target.id][String(row.km)]={km:row.km,before:before.minutes,after:row.minutes,at};}}
    await storage.set({timeEdits});
    await log({storeId:target.id,type:'revalidated',automatic,jobId:p.job.id,tabId:target.tabId,before:p.before,after:expected});
    await readPortal(d.config);
    return {id:target.id,name:target.name,mode:'live',verified:true,revalidated:true,changed:true,rows:expected};
  }catch(e){p.stage='awaiting-confirmation';p.lastError=e.message;await storage.set({states:d.states});throw e;}
}
async function ensureAlarm(){const {config}=await get();await chrome.alarms.create(alarmName,{periodInMinutes:Math.max(30,config.intervalSeconds)/60});}
async function tick(manual=false){
  if(running)return {busy:true};running=true;
  try {
    const d=await get(),c=validate(d.config),states=d.states;
    if(c.profile?.role==='executor'){await storage.set({status:{...d.status,message:'Perfil iFood: testes disponíveis; comunicação com o perfil Saipos ainda não conectada.'}});return;}
    if(c.profile?.role==='reader')c.mode='simulate';
    if(!c.enabled&&(!manual||c.mode==='live')){await storage.set({status:{...d.status,message:'Pausado — clique Consultar agora para diagnóstico em simulação'}});return;}
    if(!inSchedule(Date.now(),c)&&(!manual||c.mode==='live')){for(const s of Object.values(states)){s.lowerCount=0;s.feeLowerCount=0;}await storage.set({states,status:{at:Date.now(),message:'Fora do horário programado'}});return;}
    const sources={};
    for(const s of c.sources.filter(s=>c.targets.some(t=>t.enabled&&t.sourceId===s.id))){
      try {
        let r;
        try {r=await send(s.tabId,{type:'SAIPOS_READ'});}catch{}
        if(!r||r.storeId!==s.storeId){
          const candidates=await queryTabs({url:['https://conta.saipos.com/*']});
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
    const portal=c.profile?.role!=='reader'?await readPortal(c):null;
    const results=[];
    for(const t of c.targets.filter(t=>t.enabled)){
      const key=c.mode+':'+t.id,st=states[key]||{};
      try {
        if(st.pending){results.push(await reconcilePending(d,key,true));continue;}
        const source=sources[t.sourceId];if(!source||source.error){st.lowerCount=0;st.feeLowerCount=0;states[key]=st;throw Error(source?.error||'Sem fonte.');}
        const calc=adjustment(t,source,st,c),{next,rows:adjustmentRows,productionMinutes:desired}=calc;
        const desiredRows=plan(t,calc.desiredTime,next.feeOffsetCents/100);
        const rows=portal?.ok?stepRows(adjustmentRows,portal.rows,t.adjustStepMinutes,desiredRows):adjustmentRows;
        const breakdown={mode:t.timeMode,scope:t.volumeMetric,volume:calc.volume,oldestMinutes:desired,preparationMinutes:next.offset,desiredPreparationMinutes:calc.desiredTime,deliveryAverage:t.averageDeliveryMinutes,step:t.adjustStepMinutes,feeEnabled:t.feeMode==='demand',feeVolume:calc.feeVolume,feeThreshold:calc.feeThreshold,feeExtra:next.feeOffsetCents/100};
        if(c.mode==='simulate'){
          // Simulação não muda o Portal nem o estado de execução real.
          states[key]={...next};results.push({id:t.id,name:t.name,mode:c.mode,productionMinutes:desired,timeMode:t.timeMode,preparationMinutes:next.offset,volume:calc.volume,threshold:calc.threshold,feeExtra:next.feeOffsetCents/100,breakdown,desiredRows,rows});continue;
        }
        if(!portal?.ok)throw Error(portal?.error||'Leia a tabela iFood antes de ajustar.');
        if(!(await get()).config.enabled||!inSchedule(Date.now(),c))break;
        let bound;try{bound=await ownedTab(chrome,t.tabId,incognito);}catch{}
        if(!bound?.url?.startsWith('https://portal.ifood.com.br/merchant-delivery-core-portal-experience')){
          const candidates=await queryTabs({url:['https://portal.ifood.com.br/merchant-delivery-core-portal-experience*']});
          if(candidates.length!==1)throw Error('Vincule exatamente uma aba de entrega iFood neste perfil.');
          t.tabId=candidates[0].id;await bind('targets',t.id,t.tabId);
        }
        const job={type:'JOSE_EXECUTE',id:crypto.randomUUID(),target:{...t,profilePinned:true},rows,expiresAt:source.capturedAt+c.staleSeconds*1000};
        // Persistir antes do primeiro efeito externo; recuperação nunca reenvia às cegas.
        states[key]={...st,pending:{job,...next,createdAt:Date.now(),stage:'prepared'}};
        await storage.set({states});
        const r=await send(t.tabId,job);
        if(r.expected)states[key].pending.expected=r.expected;
        if(r.before)states[key].pending.before=r.before;
        states[key].pending.submission=r.submission||null;
        states[key].pending.stage=r.ok?'verifying':r.uncertain?'awaiting-confirmation':'not-submitted';
        await storage.set({states});
        if(!r.ok){if(!r.uncertain){delete states[key].pending;await storage.set({states});}throw Error(r.error||'Envio não confirmado.');}
        states[key].pending.expected=r.expected;
        await storage.set({states});
        if(!r.unchanged){const check=await verifyReload(t,r.expected);if(!check.ok)throw Error(check.error||'Prazo não confirmado após recarga.');}
        await readPortal(c);
        states[key]={...next};
        results.push({id:t.id,name:t.name,mode:c.mode,productionMinutes:desired,timeMode:t.timeMode,preparationMinutes:next.offset,volume:calc.volume,threshold:calc.threshold,feeExtra:next.feeOffsetCents/100,breakdown,desiredRows,rows,verified:true,changed:!r.unchanged});
        if(!r.unchanged){const timeEdits=(await get()).timeEdits;timeEdits[t.id]||={};const at=new Date().toISOString();for(const row of r.expected){const before=r.before?.find(b=>b.km===row.km);if(before&&before.minutes!==row.minutes)timeEdits[t.id][String(row.km)]={km:row.km,before:before.minutes,after:row.minutes,at};}await storage.set({timeEdits});}
        await log({storeId:t.id,type:r.unchanged?'unchanged':'saved',breakdown,jobId:job.id,before:r.before,after:r.expected});
      }catch(e){if(states[key]){states[key].lowerCount=0;states[key].feeLowerCount=0;}results.push({id:t.id,name:t.name,error:e.message});await log({storeId:t.id,type:'blocked',error:e.message});}
      await storage.set({states});
    }
    const status={at:Date.now(),message:results.some(r=>r.error)?'Ciclo com ajustes bloqueados':results.length?'Ciclo concluído':'Habilite pelo menos um destino para simular.',sources,results};
    await storage.set({status});
    await chrome.action.setBadgeText({text:results.some(r=>r.error)?'!':c.mode==='live'?'ON':'SIM'});
    await chrome.action.setBadgeBackgroundColor({color:results.some(r=>r.error)?'#b42318':'#176b52'});
    return status;
  }catch(e){await storage.set({status:{at:Date.now(),message:e.message,error:true}});return {error:e.message};}
  finally{running=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===alarmName)tick();});
chrome.runtime.onInstalled.addListener(async()=>{const {config}=await get();config.enabled=false;await storage.set({config});await ensureAlarm();});
chrome.runtime.onStartup.addListener(async()=>{await ensureAlarm();await tick();});
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  // Apenas páginas internas da extensão podem controlar o executor.
  if(s.id!==chrome.runtime.id||!s.url?.startsWith(chrome.runtime.getURL('')))return;
  if(s.tab&&!!s.tab.incognito!==incognito){reply({error:'Mensagem de outro ambiente bloqueada.'});return false;}
  (async()=>{
    await ready;
    if(m.type==='OPEN_BOTH'||m.type==='OPEN_DASHBOARD'){
      if(opening)throw Error('Aguarde a abertura das páginas.');opening=true;
      try{return await openContextPages(chrome,incognito,m.type==='OPEN_BOTH'?LOGIN_PAGES:[chrome.runtime.getURL('options.html')],s,m.type==='OPEN_DASHBOARD');}finally{opening=false;}
    }
    if(m.type==='STATE')return get();
    if(m.type==='READ_IFOOD'){
      if(running)return {busy:true};running=true;
      try{return await readPortal((await get()).config);}finally{running=false;}
    }
    if(m.type==='LINK_ACCOUNTS'){
      if(running)throw Error('Aguarde o ciclo atual.');running=true;
      try{
        const start=Date.now(),d=await get(),c=d.config,t=c.targets.find(t=>t.id===String(m.targetId||c.profile.targetId));
        if(Object.values(d.states).some(s=>s.pending))throw Error('Revalide o envio pendente antes de vincular abas.');
        const source=c.sources.find(s=>s.id===t?.sourceId);if(!source)throw Error('Cadastre e salve a cozinha desta loja antes de vincular.');
        const readings=await discover();let kitchen;
        try{kitchen=chooseSaipos(readings,source,m.saiposTabId??source.tabId,scope);}
        catch(e){
          const tests=(await storage.get(['tests'])).tests||{};tests.saipos={ok:false,error:e.message,storeId:source.storeId,sourceId:source.id,readAt:Date.now(),latencyMs:Date.now()-start,readings:linkReadings(readings)};
          await storage.set({tests,status:{...d.status,discovery:linkReadings(readings),sources:{...d.status.sources,[source.id]:{error:e.message,capturedAt:Date.now()}}}});throw e;
        }
        const tabs=await queryTabs({url:['https://portal.ifood.com.br/merchant-delivery-core-portal-experience*']});
        const preferred=m.ifoodTabId??t.tabId;const matched=Number.isInteger(preferred)?tabs.filter(x=>x.id===preferred):tabs;const portalTabs=matched.length?matched:tabs.length===1?tabs:[];
        if(portalTabs.length!==1)throw Error('Escolha uma aba iFood válida deste ambiente em Cadastro. Há '+tabs.length+' aba(s) de entrega disponíveis.');
        const inspected=auditIfood(await send(portalTabs[0].id,{type:'JOSE_INSPECT'}),t,null,c);
        const changedStore=c.profile.targetId!==t.id;
        source.tabId=kitchen.tabId;t.tabId=portalTabs[0].id;
        if(changedStore){c.profile.targetId=t.id;c.enabled=false;c.mode='simulate';c.targets.forEach(x=>x.enabled=x.id===t.id);}
        else{const latest=await get();c.enabled=latest.config.enabled;c.mode=latest.config.mode;} // Pausar durante a leitura continua tendo prioridade.
        const portal={...inspected,targetId:t.id,tabId:t.tabId,latencyMs:Date.now()-start};
        const tests=(await storage.get(['tests'])).tests||{};tests.saipos={...auditSaipos(kitchen,source,c),sourceId:source.id,tabId:source.tabId,latencyMs:Date.now()-start};tests.ifood=portal;
        await storage.set({tests,config:validate(c),states:changedStore?{}:d.states,portal,status:{...d.status,at:Date.now(),message:changedStore?'Nova loja vinculada. Monitoramento pausado para revisão.':'Mesma loja reconectada. Modo e monitoramento salvos foram mantidos.',sources:{[source.id]:{...kitchen,age:demand(kitchen,c)}},results:changedStore?[]:d.status.results||[]}});
        return {ok:true,config:c,preserved:!changedStore};
      }finally{running=false;}
    }
    if(m.type==='TEST_SAIPOS'||m.type==='TEST_IFOOD'){
      if(running)throw Error('Aguarde o ciclo atual.');running=true;
      try{
        const d=await get(),start=Date.now(),tests=(await storage.get(['tests'])).tests||{};
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
              const found=await queryTabs({url:['https://portal.ifood.com.br/merchant-delivery-core-portal-experience*']});
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
        await storage.set({tests});return result;
      }finally{running=false;}
    }
    if(m.type==='TEST_RESULTS')return (await storage.get(['tests'])).tests||{};
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
        await storage.set({config:d.config,status:{...d.status,discovery:readings}});
        return {ok:true,readings,config:d.config};
      }finally{running=false;}
    }
    if(m.type==='OPEN_TAB'){
      const url=m.site==='saipos'?'https://conta.saipos.com/#/app/sale/delivery/kanban/search-customer':m.site==='ifood'?'https://portal.ifood.com.br/merchant-delivery-core-portal-experience':null;
      if(!url)throw Error('Site não autorizado.');
      return openContextPages(chrome,incognito,[url],s);
    }
    if(m.type==='TABS')return queryTabs({url:['https://conta.saipos.com/*','https://portal.ifood.com.br/*']});
    if(m.type==='SAVE'){
      if(running)throw Error('Aguarde o ciclo atual antes de salvar.');
      const config=validate(m.config),d=await get();
      if(config.enabled&&!config.targets.some(t=>t.enabled))throw Error('Habilite a loja antes de ativar o monitoramento.');
      if(Object.values(d.states).some(s=>s.pending))throw Error('Revalide os resultados pendentes antes de mudar a configuração.');
      await storage.set({config,states:{},portal:null,status:{message:'Configuração salva. Aguarda novo ciclo.'}});await ensureAlarm();return {ok:true};
    }
    if(m.type==='PAUSE'){const {config}=await get();config.enabled=false;await storage.set({config});return {ok:true,message:running?'Pausado; uma operação já enviada pode terminar.':'Pausado'};}
    if(m.type==='TICK')return tick(true);
    if(m.type==='READ_PORTAL'){
      if(running)throw Error('Aguarde o ciclo atual.');
      running=true;try{return await send(m.target.tabId,{type:'JOSE_READ',target:{...m.target,profilePinned:true}});}finally{running=false;}
    }
    if(m.type==='REVERIFY'){
      if(running)throw Error('Ciclo em execução.');running=true;
      try{
        const d=await get();let count=0;
        for(const [key,s] of Object.entries(d.states))if(s.pending){
          await reconcilePending(d,key);count++;
        }
        await storage.set({states:d.states});return {ok:true,count};
      }finally{running=false;}
    }
    throw Error('Comando desconhecido.');
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});

// O contexto anônimo pode iniciar depois do evento onStartup. Recriar seu alarme ao carregar.
const ready=ensureAlarm();ready.catch(()=>{});
