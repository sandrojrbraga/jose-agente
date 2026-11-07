import {defaults,migrate,validate} from './core.mjs';
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
function diagnosticChoices(){
  const fill=(id,choices,fallback='')=>{const s=$(id),previous=s.value;s.replaceChildren();for(const [value,label] of choices){const o=el('option',label);o.value=value;s.append(o);}s.value=choices.some(x=>x[0]===previous)?previous:fallback;};
  fill('testTarget',config.targets.map(t=>[t.id,`${t.name} · ${t.id}`]),'3148479');
  fill('testSaiposTab',tabChoices('https://conta.saipos.com/'));
  fill('testIfoodTab',tabChoices('https://portal.ifood.com.br/'));
}
function draw(){
  diagnosticChoices();
  $('sources').replaceChildren();$('targets').replaceChildren();
  for(const s of config.sources){const card=el('div');card.className='card';const grid=el('div');grid.className='grid';
    field(grid,'Identificador da cozinha',s.id,v=>s.id=v);field(grid,'Nome',s.name,v=>s.name=v);field(grid,'ID Saipos',s.storeId,v=>s.storeId=v);
    select(grid,'Aba do Kanban',s.tabId,tabChoices('https://conta.saipos.com/'),v=>s.tabId=v?Number(v):null);
    card.append(grid);const remove=el('button','Remover fonte');remove.onclick=()=>{config.sources=config.sources.filter(x=>x!==s);draw();};card.append(remove);$('sources').append(card);
  }
  for(const t of config.targets){const card=el('div');card.className='card';const grid=el('div');grid.className='grid';
    field(grid,'Nome EXATO no Portal',t.name,v=>t.name=v);field(grid,'ID iFood',t.id,v=>t.id=v);
    select(grid,'Cozinha que alimenta esta loja',t.sourceId,[['','Escolha a cozinha — vínculo pendente'],...config.sources.map(s=>[s.id,s.name])],v=>t.sourceId=v);
    select(grid,'Aba Configurações de entrega',t.tabId,tabChoices('https://portal.ifood.com.br/'),v=>t.tabId=v?Number(v):null);
    field(grid,'Limite máximo de prazo (min)',t.maxMinutes,v=>t.maxMinutes=v,'number');
    select(grid,'Taxas',t.feeMode,[['preserve','Preservar taxa existente'],['configured','Aplicar taxa fixa configurada']],v=>t.feeMode=v);
    card.append(grid);field(card,'Habilitar este destino',t.enabled,v=>t.enabled=v,'checkbox');
    field(card,'Confirmei que Tempo é o prazo total e que base + produção não duplica o preparo',t.semanticsConfirmed,v=>t.semanticsConfirmed=v,'checkbox');
    const label=el('label','Faixas: limite superior em km; tempo-base em minutos; taxa em R$ (opcional no modo preservar)');
    const area=el('textarea');area.rows=8;area.value=t.bands.map(b=>`${b.km};${b.minutes};${b.fee??''}`).join('\n');
    area.addEventListener('change',()=>{t.bands=area.value.trim().split('\n').filter(Boolean).map(line=>{const [km,minutes,fee]=line.split(';');return {km:Number(km?.replace(',','.')),minutes:Number(minutes),fee:fee?.trim()?Number(fee.replace(',','.')):null};});});
    label.append(area);card.append(label);
    const p=el('p','Exemplo: 0.5;19;6.99. Para 7–10 km use o limite 10. Informe todas as faixas existentes na mesma ordem.');card.append(p);
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
  config.profile={label:$('profileLabel').value,role:$('profileRole').value};
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
      box.append(el('pre',r.rows.map(b=>`${b.km} km: tela ${b.minutes} min · R$ ${b.fee.toFixed(2)}${b.proposedMinutes!==null?' · cálculo '+b.proposedMinutes+' min':''}`).join('\n')));box.append(el('p',r.note));
    }
    $('testResults').append(box);
  }
}
async function refresh(){
  const d=await call({type:'STATE'});$('status').replaceChildren();
  const p=el('p',d.status.at?`${new Date(d.status.at).toLocaleString('pt-BR')} · ${d.status.message}`:'Nenhum ciclo executado.');$('status').append(p);
  for(const r of d.status.results||[]){const c=el('div');c.className='card';c.append(el('strong',`${r.name} · ${r.id}`));c.append(el('p',r.error||`${r.mode==='simulate'?'SIMULAÇÃO':'CONFIRMADO'} · produção: ${r.productionMinutes} min`));
    if(r.rows)c.append(el('pre',r.rows.map(b=>`${b.km} km → ${b.minutes} min${b.fee!==null?' · R$ '+b.fee.toFixed(2):''}`).join('\n')));$('status').append(c);}
  $('logs').textContent=JSON.stringify(d.logs,null,2);
  showTests(await call({type:'TEST_RESULTS'}));
  $('sourceStatus').textContent=JSON.stringify(d.status.sources||{},null,2);
  if(d.status.discovery)$('discovery').textContent=JSON.stringify(d.status.discovery.map(({tabId,storeId,count,complete,error})=>({tabId,storeId,count,complete,error})),null,2);
}
async function action(fn){try{await fn();}catch(e){message(e.message,true);}}
$('save').onclick=()=>action(async()=>{const c=readForm();if(c.mode==='live'&&c.enabled&&!confirm('Ativar alterações reais nos IDs habilitados, dentro do horário configurado?'))return;const r=await call({type:'SAVE',config:c});if(r.error)throw Error(r.error);message('Configuração salva. Agendamento ativo no Chrome.');await refresh();});
$('pause').onclick=()=>action(async()=>{const r=await call({type:'PAUSE'});$('enabled').checked=false;message(r.message);});
$('tick').onclick=()=>action(async()=>{message('Consultando a configuração SALVA…');const r=await call({type:'TICK'});if(r.error)throw Error(r.error);await refresh();});
$('verify').onclick=()=>action(async()=>{const r=await call({type:'REVERIFY'});if(r.error)throw Error(r.error);message(`${r.count} envio(s) revalidado(s), sem reenvio.`);await refresh();});
$('refresh').onclick=()=>action(async()=>{tabs=await call({type:'TABS'});draw();await refresh();});
$('addSource').onclick=()=>{config.sources.push({id:'cozinha-'+(config.sources.length+1),name:'Nova cozinha',storeId:'',tabId:null});draw();};
$('addTarget').onclick=()=>{config.targets.push({id:'',name:'',sourceId:config.sources[0]?.id,enabled:false,tabId:null,semanticsConfirmed:false,maxMinutes:120,feeMode:'preserve',bands:[{km:0.5,minutes:15,fee:null}]});draw();};
$('export').onclick=()=>action(async()=>{const c=readForm();const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download='jose-configuracao.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
$('import').onchange=()=>action(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>200000)throw Error('Arquivo grande demais.');config=validate(migrate(JSON.parse(await f.text())));config.enabled=false;config.mode='simulate';config.targets.forEach(t=>t.tabId=null);config.sources.forEach(s=>s.tabId=null);loadForm();message('Configuração carregada em simulação e pausada. Vincule as abas e salve.');});
for(const [id,type,tabField] of [['testSaipos','TEST_SAIPOS','testSaiposTab'],['testIfood','TEST_IFOOD','testIfoodTab']])$(id).onclick=()=>action(async()=>{
  $(id).disabled=true;message('Conferindo a tela, sem alterar dados...');
  try{const r=await call({type,targetId:$('testTarget').value,tabId:$(tabField).value?Number($(tabField).value):null});if(r.error&&!('ok' in r))throw Error(r.error);showTests(await call({type:'TEST_RESULTS'}));message(r.ok?'Leitura concluída. Confira o resultado abaixo.':r.error,!r.ok);}finally{$(id).disabled=false;}
});
$('exportTests').onclick=()=>action(async()=>{const tests=await call({type:'TEST_RESULTS'}),u=URL.createObjectURL(new Blob([JSON.stringify(tests,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download='jose-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
$('discover').onclick=()=>action(async()=>{
  message('Reconectando leitores e identificando cozinhas...');
  const r=await call({type:'DISCOVER'});if(r.error)throw Error(r.error);
  config=r.config;tabs=await call({type:'TABS'});loadForm();await refresh();
  message(r.readings.length?'Diagnóstico concluído. Confira os IDs e contadores abaixo.':'Nenhuma aba Saipos neste perfil. Abra o Kanban e tente novamente.');
});
for(const [id,site] of [['openSaipos','saipos'],['openIfood','ifood']])$(id).onclick=()=>action(async()=>{const r=await call({type:'OPEN_TAB',site});if(r.error)throw Error(r.error);message('Aba aberta. Faça o login no site; depois use Detectar abas Saipos.');});
try{const d=await call({type:'STATE'});config=d.config||defaults();tabs=await call({type:'TABS'});loadForm();await refresh();}catch(e){message(e.message,true);}

