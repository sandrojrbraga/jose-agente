import {connection,comparisonRows} from './view.mjs';
import {defaults,migrate,validate,inSchedule} from './core.mjs';
const $=id=>document.getElementById(id), el=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
const call=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r&&['STATE','TABS','DISCOVER'].includes(m.type))throw Error('Sem resposta do José. Recarregue a extensão e abra esta página novamente.');return r;};
let config,tabs=[];
function message(txt,error=false){$('message').textContent=txt;$('message').className=error?'error':'ok';}
function field(parent,label,value,fn,type='text'){
  const l=el('label',label),i=el('input');i.type=type;
  if(type==='checkbox')i.checked=!!value;else i.value=value??'';
  i.addEventListener('change',()=>fn(type==='checkbox'?i.checked:type==='number'?Number(i.value):i.value));l.append(i);parent.append(l);return i;
}
function select(parent,label,value,choices,fn){
  const l=el('label',label),s=el('select');for(const [val,title] of choices){const o=el('option',title);o.value=val;s.append(o);}s.value=value??'';s.addEventListener('change',()=>fn(s.value));l.append(s);parent.append(l);return s;
}
const tabChoices=host=>[['','Selecione a aba aberta'],...tabs.filter(t=>t.url?.startsWith(host)).map(t=>[String(t.id),`${t.id} · ${t.title}`])];
function draw(){
  const picker=$('profileTarget');picker.replaceChildren();
  for(const t of config.targets){const o=el('option',`${t.name} · ${t.id}`);o.value=t.id;picker.append(o);}picker.value=config.profile.targetId;
  $('profileStore').textContent=config.targets.find(t=>t.id===config.profile.targetId)?.name||'Escolha a loja';
  $('sources').replaceChildren();$('targets').replaceChildren();$('registration').replaceChildren();
  for(const s of config.sources){const card=el('div');card.className='card';const grid=el('div');grid.className='grid';
    field(grid,'Nome',s.name,v=>s.name=v);field(grid,'ID Saipos',s.storeId,v=>s.storeId=v);
    select(grid,'Aba do Kanban',s.tabId,tabChoices('https://conta.saipos.com/'),v=>s.tabId=v?Number(v):null);
    card.append(grid);const remove=el('button','Remover fonte');remove.onclick=()=>{config.sources=config.sources.filter(x=>x!==s);draw();};card.append(remove);$('sources').append(card);
  }
  for(const t of config.targets.filter(t=>t.id===config.profile.targetId)){const card=el('div');card.className='card';const grid=el('div');grid.className='grid';
    const registration=el('div');registration.className='grid';
    field(registration,'Nome no Portal iFood',t.name,v=>t.name=v);const identity=field(registration,'ID iFood',t.id,v=>{t.id=v;config.profile.targetId=v;});identity.readOnly=!!t.id;
    select(registration,'Cozinha que alimenta esta loja',t.sourceId,[['','Escolha a cozinha — vínculo pendente'],...config.sources.map(s=>[s.id,s.name])],v=>t.sourceId=v);
    select(registration,'Aba Configurações de entrega',t.tabId,tabChoices('https://portal.ifood.com.br/'),v=>t.tabId=v?Number(v):null);
    $('registration').append(registration);
    select(grid,'Como calcular o preparo',t.timeMode,[['oldest','Tempo do pedido mais antigo em Cozinha'],['volume','Quantidade de pedidos · usar patamares'],['combined','Idade + patamar · fórmula anterior']],v=>{t.timeMode=v;draw();});
    select(grid,'Tempo de entrega',t.deliveryMode,[['bands','Por faixa de km · tabela abaixo'],['average','Tempo médio único para todas as faixas']],v=>{t.deliveryMode=v;draw();});
    const average=field(grid,'Tempo médio de entrega (min)',t.averageDeliveryMinutes,v=>{t.averageDeliveryMinutes=v;draw();},'number');average.min=1;average.step=1;average.disabled=t.deliveryMode!=='average';
    field(grid,'Limite máximo de prazo (min)',t.maxMinutes,v=>t.maxMinutes=v,'number');
    select(grid,'Taxas',t.feeMode,[['preserve','Preservar taxa existente'],['configured','Taxa-base fixa por km'],['demand','Taxa-base + acréscimo por volume']],v=>t.feeMode=v);
    field(grid,'Teto da taxa por faixa (R$)',t.maxFee,v=>t.maxFee=v,'number').step='0.01';
    field(grid,'Redução da taxa por etapa (R$)',t.decreaseStepFee,v=>t.decreaseStepFee=v,'number').step='0.01';
    select(grid,'Volume usado nos patamares',t.volumeMetric,[['kitchen','Pedidos em Cozinha'],['waiting','Cozinha + Aguardando entrega']],v=>t.volumeMetric=v);
    card.append(grid);
    const formula=t.timeMode==='oldest'?'Preparo = idade do pedido mais antigo em Cozinha. Os minutos dos patamares não entram no prazo.':t.timeMode==='volume'?'Preparo = minutos do patamar alcançado pela quantidade. A idade dos pedidos não é somada.':'Preparo = idade do pedido mais antigo + minutos do patamar. Fórmula anterior mantida para revisão.';
    card.append(el('p',formula+' Prazo final = preparo + '+(t.deliveryMode==='average'?t.averageDeliveryMinutes+' min de entrega em todas as faixas.':'tempo de entrega de cada faixa de km.')));
    field(card,'Habilitar este destino',t.enabled,v=>t.enabled=v,'checkbox');
    field(card,'Confirmei que Tempo é o prazo total e que entrega + preparo não duplica outro ajuste',t.semanticsConfirmed,v=>t.semanticsConfirmed=v,'checkbox');
    card.append(el('h3','Entrega e taxa-base por distância'));
    card.append(el('p','Informe todas as faixas do Portal. Km é o limite superior de cada faixa. Os acréscimos serão somados à base abaixo.'));
    const table=el('table'),head=el('tr');for(const title of ['Até km','Entrega (min)','Taxa-base (R$)',''])head.append(el('th',title));table.append(head);
    t.bands.forEach((b,i)=>{const row=el('tr');
      for(const [key,label,step] of [['km','Km','0.1'],['minutes','Minutos','1'],['fee','Taxa','0.01']]){
        const td=el('td'),input=el('input');input.type='number';input.step=step;input.min=key==='fee'?'0':key==='km'?'0.1':'1';input.value=key==='minutes'&&t.deliveryMode==='average'?t.averageDeliveryMinutes:b[key]??'';input.setAttribute('aria-label',`${label} da faixa ${i+1}`);if(key==='minutes'&&t.deliveryMode==='average'){input.disabled=true;input.title='Usando o tempo médio único acima; este valor fica guardado para o modo por km.';}
        input.onchange=()=>{b[key]=key==='fee'&&input.value===''?null:Number(input.value);};td.append(input);row.append(td);
      }
      const td=el('td'),remove=el('button','Remover');remove.onclick=()=>{t.bands.splice(i,1);draw();};td.append(remove);row.append(td);table.append(row);
    });card.append(table);
    const addBand=el('button','Adicionar faixa de km');addBand.onclick=()=>{const last=t.bands.at(-1);t.bands.push({km:(last?.km||0)+0.5,minutes:last?.minutes||15,fee:last?.fee??null});draw();};card.append(addBand);
    card.append(el('h3','Patamares de demanda'));
    card.append(el('p','Ao atingir X pedidos, aplica o patamar mais alto alcançado. Cada acréscimo é total sobre a base; os patamares não se somam. No modo por quantidade, os minutos representam o preparo estimado. No modo pedido mais antigo, esses minutos são ignorados e a taxa pode continuar seguindo o volume.'));
    const rules=el('table'),rh=el('tr');for(const title of ['A partir de X pedidos',t.timeMode==='oldest'?'Minutos · não usados':t.timeMode==='volume'?'Preparo estimado (min)':'Acréscimo de preparo (min)','+ Taxa (R$)',''])rh.append(el('th',title));rules.append(rh);
    t.volumeRules.forEach((r,i)=>{const row=el('tr');for(const [key,label,step] of [['minOrders','Volume','1'],['extraMinutes','Acréscimo de tempo','1'],['extraFee','Acréscimo de taxa','0.01']]){
      const td=el('td'),input=el('input');input.type='number';input.step=step;input.min=key==='minOrders'?'1':'0';input.value=r[key];input.setAttribute('aria-label',`${label} do patamar ${i+1}`);if(key==='extraMinutes'&&t.timeMode==='oldest')input.disabled=true;input.onchange=()=>r[key]=Number(input.value);td.append(input);row.append(td);
    }const td=el('td'),remove=el('button','Remover');remove.onclick=()=>{t.volumeRules.splice(i,1);draw();};td.append(remove);row.append(td);rules.append(row);});card.append(rules);
    const addRule=el('button','Adicionar patamar');addRule.onclick=()=>{const last=t.volumeRules.at(-1);t.volumeRules.push({minOrders:(last?.minOrders||0)+1,extraMinutes:last?.extraMinutes||0,extraFee:last?.extraFee||0});draw();};card.append(addRule);
    card.append(el('p','Taxa por demanda exige taxas-base e pelo menos um patamar. Abaixo do primeiro patamar, o preparo por quantidade é zero. A volta à base usa leituras consecutivas e passos de redução; leitura inválida interrompe a redução. Não pausa a loja.'));
    const actions=el('div');actions.className='actions';
    const read=el('button','Ler faixas atuais do Portal');read.onclick=async()=>{read.disabled=true;try{const r=await call({type:'READ_PORTAL',target:t});if(r.error)throw Error(r.error);if(confirm('Usar os prazos atuais como tabela-base? Se já houver acréscimo de demanda, ele também será importado.')){t.bands=r.rows;draw();message('Tabela importada no formulário. Revise a base e salve.');}}catch(e){message(e.message,true);}finally{read.disabled=false;}};
    const remove=el('button','Remover destino');remove.onclick=()=>{config.targets=config.targets.filter(x=>x!==t);draw();};actions.append(read,remove);card.append(actions);$('targets').append(card);
  }
  $('addSource').disabled=config.sources.length>=5;$('addTarget').disabled=config.targets.length>=11;
}
function loadForm(){
  $('profileLabel').value=config.profile?.label||'';$('profileRole').value=config.profile?.role||'local';
  $('mode').value=config.mode;$('interval').value=config.intervalSeconds;$('stale').value=config.staleSeconds;$('readings').value=config.decreaseReadings;$('step').value=config.decreaseStepMinutes;$('timezone').value=config.timezone;$('enabled').checked=config.enabled;$('start').value=config.schedule.start;$('end').value=config.schedule.end;
  $('days').replaceChildren();['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach((name,i)=>field($('days'),name,config.schedule.days.includes(i),v=>{config.schedule.days=v?[...new Set([...config.schedule.days,i])]:config.schedule.days.filter(d=>d!==i);},'checkbox'));draw();
}
function readForm(){
  config.profile={...config.profile,label:$('profileLabel').value,role:$('profileRole').value};
  config.mode=$('mode').value;config.enabled=$('enabled').checked;config.timezone=$('timezone').value;
  for(const [key,id] of [['intervalSeconds','interval'],['staleSeconds','stale'],['decreaseReadings','readings'],['decreaseStepMinutes','step']])config[key]=Number($(id).value);
  config.schedule.start=$('start').value;config.schedule.end=$('end').value;return validate(config);
}
function showTests(tests){
  $('testResults').replaceChildren();
  for(const [key,r] of Object.entries(tests)){
    const box=el('div');box.className='card';box.append(el('strong',`${key==='saipos'?'Saipos':'iFood'} · ${r.ok?'LEITURA OK':'BLOQUEADO'}`));
    box.append(el('p',`${new Date(r.readAt).toLocaleString('pt-BR')} · ${r.latencyMs} ms · aba ${r.tabId??'não identificada'}`));
    if(!r.ok)box.append(el('p',r.error));
    else if(key==='saipos'){
      box.append(el('p',`Saipos ${r.storeId} · pedido mais antigo em produção: ${r.productionMinutes} min`));
      box.append(el('pre',(r.stages||[]).map(s=>`${s.stage}: ${s.count}`).join('\n')));
    }else{
      box.append(el('p',`${r.name} · ID esperado ${r.configuredStoreId}`));box.append(el('p',r.identityNote));
      box.append(el('pre',r.rows.map(b=>`${b.km} km: tela ${b.minutes} min · R$ ${b.fee.toFixed(2)}${b.proposedMinutes!==null?' · cálculo '+b.proposedMinutes+' min':''}${b.proposedFee!=null?' · taxa prevista R$ '+b.proposedFee.toFixed(2):''}`).join('\n')));box.append(el('p',r.note));
    }
    $('testResults').append(box);
  }
}
function renderOverview(d){
  const saved=d.config,target=saved.targets.find(t=>t.id===saved.profile.targetId),source=saved.sources.find(s=>s.id===target?.sourceId),now=Date.now();
  $('profileStore').textContent=target?.name||'Loja não cadastrada';
  const result=d.status.results?.find(r=>r.id===target?.id);
  const raw=source&&d.status.sources?.[source.id];
  const validSource=raw?{ok:!raw.error,readAt:raw.capturedAt,error:raw.error}:null;
  const sc=connection(validSource,saved.staleSeconds,now),pc=connection(d.portal?.targetId===target?.id?d.portal:null,saved.staleSeconds,now);
  for(const [id,c,note] of [['saipos',sc,raw&&!raw.error?`${raw.count} em Cozinha · mais antigo ${raw.age} min`:sc.note],['ifood',pc,d.portal?.ok&&d.portal.targetId===target?.id?`${d.portal.rows.length} faixas · ${d.portal.latencyMs} ms · ${pc.note}`:pc.note]]){
    $(id+'State').textContent=c.label;$(id+'State').className=c.tone;$(id+'Note').textContent=note;
  }
  $('monitorState').textContent=!saved.enabled?'Pausado':!inSchedule(now,saved)?'Fora do horário':saved.mode==='simulate'?'Simulação':'Execução';
  $('monitorNote').textContent=`Configuração salva · ciclo de ${saved.intervalSeconds}s`;
  const last=d.logs.find(l=>l.type==='saved'&&l.storeId===target?.id);
  $('lastSaved').textContent=last?new Date(last.at).toLocaleTimeString('pt-BR'):'Nenhuma registrada';
  $('lastSavedNote').textContent=last?'Salva e relida no Portal':'Simulação e leitura não contam como alteração.';
  $('comparison').replaceChildren();
  const planned=result&&!result.error&&now-d.status.at<=saved.staleSeconds*1000?result.rows:null;
  const current=pc.tone==='ok'?d.portal.rows:null;
  for(const row of comparisonRows(current,planned)){
    const tr=el('tr');for(const value of [row.km+' km',row.current,row.proposed,row.label])tr.append(el('td',value));$('comparison').append(tr);
  }
  $('comparisonNote').textContent=result?.error?result.error:!current?'Leia o iFood para ver os valores atuais da loja.':!planned?'Clique Consultar e calcular agora para comparar com os parâmetros salvos.':saved.mode==='simulate'?'Simulação: comparação somente de leitura.':'Comparação das últimas leituras. Confira o registro da última alteração acima.';
}
let liveRefresh=false;
async function updatePortal(){
  if(liveRefresh||document.hidden)return;liveRefresh=true;
  try{await call({type:'READ_IFOOD'});await refresh();}catch(e){message(e.message,true);}finally{liveRefresh=false;}
}
async function refresh(){
  const d=await call({type:'STATE'});renderOverview(d);$('status').replaceChildren();
  const p=el('p',d.status.at?`${new Date(d.status.at).toLocaleString('pt-BR')} · ${d.status.message}`:'Nenhum ciclo executado.');$('status').append(p);
  for(const r of d.status.results||[]){const c=el('div');c.className='card';c.append(el('strong',`${r.name} · ${r.id}`));c.append(el('p',r.error||`${r.mode==='simulate'?'SIMULAÇÃO':r.changed?'ALTERAÇÃO CONFIRMADA':'JÁ ESTAVA CORRETO'} · pedido mais antigo: ${r.productionMinutes} min · preparo aplicado: ${r.preparationMinutes??r.productionMinutes} min · volume: ${r.volume??'—'} · patamar: ${r.threshold??'base'} · acréscimo de taxa: R$ ${(r.feeExtra||0).toFixed(2)}`));
    if(r.rows)c.append(el('pre',r.rows.map(b=>`${b.km} km → ${b.minutes} min${b.fee!==null?' · R$ '+b.fee.toFixed(2):''}`).join('\n')));$('status').append(c);}
  $('logs').textContent=JSON.stringify(d.logs,null,2);
  showTests(await call({type:'TEST_RESULTS'}));
  $('sourceStatus').textContent=Object.entries(d.status.sources||{}).map(([id,s])=>s.error?`${id}: BLOQUEADO — ${s.error}`:`${config.sources.find(x=>x.id===id)?.name||id} · ID ${s.storeId} · Cozinha: ${s.count} · mais antigo: ${s.age} min\n${(s.stages||[]).map(x=>x.stage+': '+x.count).join(' · ')}`).join('\n\n')||'Ainda não há leitura neste ciclo.';
  if(d.status.discovery)$('discovery').textContent=JSON.stringify(d.status.discovery.map(({tabId,storeId,count,complete,error})=>({tabId,storeId,count,complete,error})),null,2);
}
async function action(fn){try{await fn();}catch(e){message(e.message,true);}}
$('save').onclick=()=>action(async()=>{const c=readForm();if(c.mode==='live'&&c.enabled&&!confirm('Ativar alterações reais nos IDs habilitados, dentro do horário configurado?'))return;const r=await call({type:'SAVE',config:c});if(r.error)throw Error(r.error);message(c.enabled?'Configuração salva. Agendamento habilitado no Chrome.':'Configuração salva. Monitoramento pausado.');await refresh();});
$('pause').onclick=()=>action(async()=>{const r=await call({type:'PAUSE'});$('enabled').checked=false;message(r.message);});
$('tick').onclick=()=>action(async()=>{message('Consultando a configuração SALVA…');const r=await call({type:'TICK'});if(r.error)throw Error(r.error);await refresh();});
$('verify').onclick=()=>action(async()=>{const r=await call({type:'REVERIFY'});if(r.error)throw Error(r.error);message(`${r.count} envio(s) revalidado(s), sem reenvio.`);await refresh();});
$('refresh').onclick=()=>action(async()=>{tabs=await call({type:'TABS'});draw();await refresh();});
$('addSource').onclick=()=>{config.sources.push({id:'cozinha-'+(config.sources.length+1),name:'Nova cozinha',storeId:'',tabId:null});draw();};
$('addTarget').onclick=()=>{config.targets.push({id:'',name:'',sourceId:config.sources[0]?.id,enabled:false,tabId:null,semanticsConfirmed:false,maxMinutes:120,feeMode:'preserve',timeMode:'oldest',deliveryMode:'bands',averageDeliveryMinutes:15,volumeMetric:'kitchen',volumeRules:[],maxFee:30,decreaseStepFee:1,bands:[{km:0.5,minutes:15,fee:null}]});draw();};
$('export').onclick=()=>action(async()=>{const c=readForm();const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download='jose-configuracao.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
$('import').onchange=()=>action(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>200000)throw Error('Arquivo grande demais.');config=validate(migrate(JSON.parse(await f.text())));config.enabled=false;config.mode='simulate';config.targets.forEach(t=>t.tabId=null);config.sources.forEach(s=>s.tabId=null);loadForm();message('Configuração carregada em simulação e pausada. Vincule as abas e salve.');});
for(const [id,type] of [['testSaipos','TEST_SAIPOS'],['testIfood','TEST_IFOOD']])$(id).onclick=()=>action(async()=>{
  $(id).disabled=true;message('Lendo os vínculos salvos, sem alterar dados...');
  try{const r=await call({type,targetId:config.profile.targetId});if(r.error&&!('ok' in r))throw Error(r.error);showTests(await call({type:'TEST_RESULTS'}));message(r.ok?'Leitura concluída.':r.error,!r.ok);await refresh();}finally{$(id).disabled=false;}
});
$('exportTests').onclick=()=>action(async()=>{const d=await call({type:'STATE'}),tests={...await call({type:'TEST_RESULTS'})};if(d.portal)tests.ifood=d.portal;const u=URL.createObjectURL(new Blob([JSON.stringify(tests,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download='jose-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
$('discover').onclick=()=>action(async()=>{
  message('Reconectando leitores e identificando cozinhas...');
  const r=await call({type:'DISCOVER'});if(r.error)throw Error(r.error);
  config=r.config;tabs=await call({type:'TABS'});loadForm();await refresh();
  message(r.readings.length?'Diagnóstico concluído. Confira os IDs e contadores abaixo.':'Nenhuma aba Saipos neste perfil. Abra o Kanban e tente novamente.');
});
for(const [id,site] of [['openSaipos','saipos'],['openIfood','ifood']])$(id).onclick=()=>action(async()=>{const r=await call({type:'OPEN_TAB',site});if(r.error)throw Error(r.error);message('Aba aberta. Faça o login no site; depois use Detectar abas Saipos.');});
$('profileTarget').onchange=()=>{config.profile.targetId=$('profileTarget').value;config.targets.forEach(t=>t.enabled=false);$('enabled').checked=false;config.enabled=false;config.mode='simulate';$('mode').value='simulate';draw();message('Loja do perfil alterada no formulário. Vincule as abas, revise e salve em simulação.');};
try{const d=await call({type:'STATE'});config=d.config||defaults();tabs=await call({type:'TABS'});loadForm();await refresh();}catch(e){message(e.message,true);}


for(const button of document.querySelectorAll('[data-page]'))button.onclick=()=>{
  for(const page of document.querySelectorAll('.page'))page.hidden=page.id!==button.dataset.page;
  for(const b of document.querySelectorAll('[data-page]'))b.setAttribute('aria-pressed',String(b===button));
};
$('readIfood').onclick=()=>updatePortal();
await updatePortal();
setInterval(()=>{if(!document.hidden)updatePortal();},5000);
