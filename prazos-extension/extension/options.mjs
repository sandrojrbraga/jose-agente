import {diagnosticReport} from './export-diagnostics.mjs';
import {connection,comparisonRows} from './view.mjs';
import {defaults,migrate,validate,inSchedule} from './core.mjs';
const $=id=>document.getElementById(id), el=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
const call=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r&&['STATE','TABS','DISCOVER'].includes(m.type))throw Error('Sem resposta do José. Recarregue a extensão e abra esta página novamente.');return r;};
let config,tabs=[],savedConfig=null,saving=false;
function message(txt,error=false){$('message').textContent=txt;$('message').className=error?'error':'ok';$('saveMessage').textContent=txt;$('saveMessage').className=error?'error':'ok';}
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
    select(grid,'1 · Regra de ajuste automático',t.timeMode,[['volume','Quantidade de pedidos → minutos do patamar'],['oldest','Tempo do pedido mais antigo']],v=>{t.timeMode=v;t.semanticsConfirmed=false;draw();});
    select(grid,'2 · Onde medir a fila',t.volumeMetric,[['kitchen','Somente Cozinha'],['waiting','Cozinha + Aguardando entrega']],v=>{t.volumeMetric=v;t.semanticsConfirmed=false;draw();});
    const average=field(grid,'3 · Tempo médio de entrega · X minutos',t.averageDeliveryMinutes,v=>{t.averageDeliveryMinutes=v;draw();},'number');average.min=1;average.step=1;
    const step=field(grid,'4 · Ajustar cada distância em até X min por ciclo',t.adjustStepMinutes,v=>{t.adjustStepMinutes=v;draw();},'number');step.min=1;step.max=60;step.step=1;
    field(grid,'Limite máximo de prazo (min)',t.maxMinutes,v=>t.maxMinutes=v,'number');


    card.append(grid);
    const formula=t.timeMode==='volume'?'QUANTIDADE da fila escolhida → PREPARO EM MINUTOS do patamar':'MAIOR TEMPO no campo “Desde” dos cartões da fila escolhida';
    const explanation=el('p',formula+' + '+t.averageDeliveryMinutes+' min de ENTREGA MÉDIA + ADICIONAL DE DISTÂNCIA = META. O próximo envio aproxima o valor atual dessa meta em até '+t.adjustStepMinutes+' min por ciclo.');explanation.className='formula';card.append(explanation);
    card.append(el('p',t.timeMode==='volume'?'A quantidade não é tratada como minutos. Configure abaixo quantos minutos de preparo correspondem a cada volume.':'O campo “Desde” mede a permanência na etapa atual; não é o tempo total desde a compra. Em Cozinha + Aguardando, usa o maior desses tempos.'));
    field(card,'Habilitar este destino',t.enabled,v=>t.enabled=v,'checkbox');
    field(card,'Confirmei que Tempo é o prazo total e que entrega + preparo não duplica outro ajuste',t.semanticsConfirmed,v=>t.semanticsConfirmed=v,'checkbox');
    card.append(el('h3','Adicional por distância e taxa-base'));
    card.append(el('p','A média de entrega é a parcela comum. O adicional abaixo é somado somente à faixa correspondente. Exemplo: 30 de preparo + 15 de entrega média + 5 desta distância = meta de 50 min. Adicional zero usa apenas a média.'));
    const table=el('table'),head=el('tr');for(const title of ['Até km','+ Distância (min)','Taxa-base (R$)',''])head.append(el('th',title));table.append(head);
    t.bands.forEach((b,i)=>{const row=el('tr');
      for(const [key,label,step] of [['km','Km','0.1'],['distanceMinutes','Adicional de distância','1'],['fee','Taxa','0.01']]){
        const td=el('td'),input=el('input');input.type='number';input.step=step;input.min=key==='fee'||key==='distanceMinutes'?'0':'0.1';input.value=b[key]??'';input.setAttribute('aria-label',`${label} da faixa ${i+1}`);
        input.onchange=()=>{b[key]=key==='fee'&&input.value===''?null:Number(input.value);};td.append(input);row.append(td);
      }
      const td=el('td'),remove=el('button','Remover');remove.onclick=()=>{t.bands.splice(i,1);draw();};td.append(remove);row.append(td);table.append(row);
    });card.append(table);
    const addBand=el('button','Adicionar faixa de km');addBand.onclick=()=>{const last=t.bands.at(-1);t.bands.push({km:(last?.km||0)+0.5,minutes:last?.minutes||15,distanceMinutes:(last?.distanceMinutes||0)+5,fee:last?.fee??null});draw();};card.append(addBand);
    card.append(el('h3','Patamares de preparo · somente tempo'));
    card.append(el('p','Ao atingir X pedidos, aplica o patamar mais alto alcançado. Cada acréscimo é total sobre a base; os patamares não se somam. No modo por quantidade, os minutos representam o preparo estimado. No modo pedido mais antigo, esses minutos são ignorados A taxa de pico é configurada separadamente abaixo.'));
    const rules=el('table'),rh=el('tr');for(const title of ['A partir de X pedidos',t.timeMode==='oldest'?'Minutos · não usados':t.timeMode==='volume'?'Preparo estimado (min)':'Acréscimo de preparo (min)',''])rh.append(el('th',title));rules.append(rh);
    t.volumeRules.forEach((r,i)=>{const row=el('tr');for(const [key,label,step] of [['minOrders','Volume','1'],['extraMinutes','Acréscimo de tempo','1']]){
      const td=el('td'),input=el('input');input.type='number';input.step=step;input.min=key==='minOrders'?'1':'0';input.value=r[key];input.setAttribute('aria-label',`${label} do patamar ${i+1}`);if(key==='extraMinutes'&&t.timeMode==='oldest')input.disabled=true;input.onchange=()=>r[key]=Number(input.value);td.append(input);row.append(td);
    }const td=el('td'),remove=el('button','Remover');remove.onclick=()=>{t.volumeRules.splice(i,1);draw();};td.append(remove);row.append(td);rules.append(row);});card.append(rules);
    const addRule=el('button','Adicionar patamar');addRule.onclick=()=>{const last=t.volumeRules.at(-1);t.volumeRules.push({minOrders:(last?.minOrders||0)+1,extraMinutes:last?.extraMinutes||0,extraFee:last?.extraFee||0});draw();};card.append(addRule);
    card.append(el('p','Abaixo do primeiro patamar, o preparo por quantidade é zero. A volta à base usa leituras consecutivas e passos de redução; leitura inválida interrompe a redução. Não pausa a loja.'));
    const surge=el('div');surge.className='surge';surge.append(el('h3','Taxa de pico · opcional para demanda extrema'));
    const toggle=field(surge,'Ativar aumento automático da taxa por volume em Cozinha',t.feeMode==='demand',on=>{t.feeMode=on?'demand':t.bands.every(b=>b.fee!==null)?'configured':'preserve';draw();},'checkbox');toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(t.feeMode==='demand'));
    surge.append(el('strong',t.feeMode==='demand'?'ATIVADA · conta somente pedidos em Cozinha':'DESATIVADA · o ajuste de tempo continua independente'));
    surge.append(el('p','X pedidos em Cozinha → taxa-base de cada km + R$ Y. Usa apenas o maior patamar alcançado; não soma patamares nem acumula a cada ciclo. Ao cair o volume, reduz gradualmente até a base. Aguardando entrega não entra nesta conta.'));
    const feeTable=el('table'),fh=el('tr');for(const name of ['A partir de X pedidos em Cozinha','+ R$ Y acima da base',''])fh.append(el('th',name));feeTable.append(fh);
    t.feeRules.forEach((r,i)=>{const row=el('tr');for(const [key,label,step] of [['minOrders','Pedidos em Cozinha','1'],['extraFee','Acréscimo em reais','0.01']]){const td=el('td'),input=el('input');input.type='number';input.step=step;input.min=key==='minOrders'?'1':'0';input.value=r[key];input.setAttribute('aria-label',`${label} do patamar de taxa ${i+1}`);input.onchange=()=>r[key]=Number(input.value);td.append(input);row.append(td);}const td=el('td'),remove=el('button','Remover');remove.onclick=()=>{t.feeRules.splice(i,1);draw();};td.append(remove);row.append(td);feeTable.append(row);});surge.append(feeTable);
    const addFee=el('button','Adicionar patamar de taxa');addFee.onclick=()=>{const last=t.feeRules.at(-1);t.feeRules.push({minOrders:(last?.minOrders||0)+1,extraFee:last?.extraFee||0});draw();};surge.append(addFee);
    const feeGrid=el('div');feeGrid.className='grid';select(feeGrid,'Taxa normal · fora do pico',t.feeMode==='preserve'?'preserve':'configured',[['preserve','Preservar taxa do Portal · pico desativado'],['configured','Manter taxa-base cadastrada por km']],v=>{t.feeMode=v;draw();});field(feeGrid,'Teto de taxa por faixa (R$)',t.maxFee,v=>t.maxFee=v,'number').step='0.01';field(feeGrid,'Redução da taxa por etapa (R$)',t.decreaseStepFee,v=>t.decreaseStepFee=v,'number').step='0.01';surge.append(feeGrid);
    surge.append(el('p','O botão só altera a configuração após Salvar. Desativar e salvar passa a manter a taxa-base cadastrada, aplicada no próximo ciclo de execução. Em simulação ou pausado, não muda o Portal.'));
    card.append(surge);
    const actions=el('div');actions.className='actions';
    const read=el('button','Ler faixas atuais do Portal');read.onclick=async()=>{read.disabled=true;try{const r=await call({type:'READ_PORTAL',target:t});if(r.error)throw Error(r.error);if(confirm('Usar os prazos atuais como tabela-base? Se já houver acréscimo de demanda, ele também será importado.')){t.averageDeliveryMinutes=Math.min(...r.rows.map(b=>b.minutes));t.deliveryMode='distance';t.bands=r.rows.map(b=>({...b,distanceMinutes:b.minutes-t.averageDeliveryMinutes}));draw();message('Tabela importada no formulário. Revise a base e salve.');}}catch(e){message(e.message,true);}finally{read.disabled=false;}};
    const remove=el('button','Remover destino');remove.onclick=()=>{config.targets=config.targets.filter(x=>x!==t);draw();};actions.append(read,remove);card.append(actions);$('targets').append(card);
  }
  $('addSource').disabled=config.sources.length>=5;$('addTarget').disabled=config.targets.length>=11;
}
function loadForm(){
  $('profileLabel').value=config.profile?.label||'';$('profileRole').value=config.profile?.role||'local';
  $('mode').value=config.mode;$('interval').value=config.intervalSeconds;$('stale').value=config.staleSeconds;$('readings').value=config.decreaseReadings;$('step').value=config.decreaseStepMinutes;$('timezone').value=config.timezone;$('enabled').checked=config.enabled;$('start').value=config.schedule.start;$('end').value=config.schedule.end;
  $('days').replaceChildren();['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach((name,i)=>field($('days'),name,config.schedule.days.includes(i),v=>{config.schedule.days=v?[...new Set([...config.schedule.days,i])]:config.schedule.days.filter(d=>d!==i);},'checkbox'));draw();
}
function readForm(check=true){
  config.profile={...config.profile,label:$('profileLabel').value,role:$('profileRole').value};
  config.mode=$('mode').value;config.enabled=$('enabled').checked;config.timezone=$('timezone').value;
  for(const [key,id] of [['intervalSeconds','interval'],['staleSeconds','stale'],['decreaseReadings','readings'],['decreaseStepMinutes','step']])config[key]=Number($(id).value);
  config.schedule.start=$('start').value;config.schedule.end=$('end').value;return check?validate(config):config;
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
  savedConfig=d.config;showPending();
  $('environment').textContent=d.context==='incognito'?'AMBIENTE ANÔNIMO · configuração temporária e separada':'AMBIENTE NORMAL · configuração persistente';
  const saved=d.config,target=saved.targets.find(t=>t.id===saved.profile.targetId),source=saved.sources.find(s=>s.id===target?.sourceId),now=Date.now();
  $('profileStore').textContent=target?.name||'Loja não cadastrada';
  const result=d.status.results?.find(r=>r.id===target?.id);
  const raw=source&&d.status.sources?.[source.id];
  const validSource=raw?{ok:!raw.error,readAt:raw.capturedAt,error:raw.error}:null;
  const sc=connection(validSource,saved.staleSeconds,now),pc=connection(d.portal?.targetId===target?.id?d.portal:null,saved.staleSeconds,now);
  for(const [id,c,note] of [['saipos',sc,raw&&!raw.error?`${raw.count} em Cozinha · mais antigo ${raw.age} min`:sc.note],['ifood',pc,d.portal?.ok&&d.portal.targetId===target?.id?`${d.portal.rows.length} faixas · ${d.portal.latencyMs??'—'} ms · ${pc.note}`:pc.note]]){
    $(id+'State').textContent=c.label;$(id+'State').className=c.tone;$(id+'Note').textContent=note;
  }
  const surge=result?.breakdown;$('feeSurgeState').textContent=target?.feeMode==='demand'?`Taxa de pico ATIVADA · somente Cozinha${surge?.feeEnabled?' · '+surge.feeVolume+' pedidos · acréscimo calculado R$ '+surge.feeExtra.toFixed(2):' · aguarda cálculo'}`:'Taxa de pico DESATIVADA · tempo automático independente';
  $('monitorState').textContent=!saved.enabled?'Pausado':!inSchedule(now,saved)?'Fora do horário':d.status.error||result?.error?'Bloqueado':saved.mode==='simulate'?'Simulação':'Execução';
  $('monitorNote').textContent=!saved.enabled&&$('enabled').checked?'Ativação marcada no formulário, ainda não salva.':`Configuração salva · ciclo de ${saved.intervalSeconds}s`;
  const edits=Object.values(d.timeEdits?.[target?.id]||{}).map(e=>({type:'saved',storeId:target.id,at:e.at,before:[{km:e.km,minutes:e.before}],after:[{km:e.km,minutes:e.after}]}));
  const last=d.logs.find(l=>l.type==='saved'&&l.storeId===target?.id)||edits.sort((a,b)=>b.at.localeCompare(a.at))[0];
  $('lastSaved').textContent=last?new Date(last.at).toLocaleTimeString('pt-BR'):'Nenhuma registrada';
  $('lastSavedNote').textContent=last?'Salva e relida no Portal':'Simulação e leitura não contam como alteração.';
  $('comparison').replaceChildren();
  const planned=result&&!result.error&&now-d.status.at<=saved.staleSeconds*1000?result.rows:null;
  const current=pc.tone==='ok'?d.portal.rows:null;
  for(const row of comparisonRows(current,planned,planned?result.desiredRows:null,[...edits,...d.logs],target?.id)){
    const tr=el('tr');for(const value of [row.km+' km',row.current,row.desired,row.proposed,row.before,row.after,row.editedAt,row.label])tr.append(el('td',value));$('comparison').append(tr);
  }
  const bd=result?.breakdown;$('calculation').textContent=bd?`${bd.mode==='volume'?'Quantidade '+bd.volume+' → patamar de '+bd.desiredPreparationMinutes+' min':'Maior tempo na etapa: '+bd.oldestMinutes+' min'} · fila: ${bd.scope==='waiting'?'Cozinha + Aguardando':'Cozinha'} + entrega média ${bd.deliveryAverage} min + adicional por distância. Preparo após redução gradual: ${bd.preparationMinutes} min. Passo máximo: ${bd.step} min por ciclo.`:'Execute uma consulta para ver cada parcela da conta.';
  $('comparisonNote').textContent=result?.error?result.error:!current?'Leia o iFood para ver os valores atuais da loja.':!planned?'Clique Consultar e calcular agora para comparar com os parâmetros salvos.':saved.mode==='simulate'?'Simulação: comparação somente de leitura.':'Comparação das últimas leituras. Confira o registro da última alteração acima.';
}
let liveRefresh=false,portalTask=null;
function updatePortal(){
  if(liveRefresh||saving||document.hidden)return;liveRefresh=true;
  portalTask=(async()=>{try{await call({type:'READ_IFOOD'});await refresh();}catch(e){message(e.message,true);}finally{liveRefresh=false;}})();return portalTask;
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
function signature(c){return JSON.stringify({...c,sources:c.sources.map(s=>({...s,tabId:null})),targets:c.targets.map(t=>({...t,tabId:null}))});}
function showPending(){
  if(!config||!savedConfig)return;
  const dirty=signature(readForm(false))!==signature(savedConfig);
  $('pendingNotice').hidden=!dirty;
  $('pendingNotice').textContent=dirty?'Há opções não salvas. O cartão Monitoramento mostra o estado SALVO; marcar Execução ou Monitorar no formulário ainda não ativa a operação. Clique Salvar e aplicar ou Iniciar monitoramento.':'';
}
async function saveAndApply(start=false){
  if(saving)return;saving=true;$('save').disabled=true;$('startMonitor').disabled=true;
  try{
    if(portalTask)await portalTask;
    if(start){$('enabled').checked=true;const target=config.targets.find(t=>t.id===config.profile.targetId);if(!target)throw Error('Escolha a loja em Cadastro.');target.enabled=true;draw();}
    const c=readForm();
    if(c.enabled&&!c.targets.some(t=>t.enabled))throw Error('Habilite a loja em Parâmetros ou use Iniciar monitoramento.');
    if(c.mode==='live'&&c.enabled&&!confirm(`Iniciar alterações reais de tempo e taxa na loja ${c.targets.find(t=>t.id===c.profile.targetId)?.name}, dentro do horário configurado?`)){message('Ativação cancelada. O monitor continua no estado salvo.',true);await refresh();return;}
    message('Salvando e conferindo a ativação...');
    const r=await call({type:'SAVE',config:c});if(r?.error)throw Error(r.error);if(!r?.ok)throw Error('O José não confirmou o salvamento. Tente novamente.');
    const verified=await call({type:'STATE'});
    if(verified.config.enabled!==c.enabled||verified.config.mode!==c.mode)throw Error('A ativação não foi confirmada no armazenamento. O monitor não foi iniciado.');
    savedConfig=verified.config;showPending();await refresh();
    if(c.enabled){const cycle=await call({type:'TICK'});await refresh();const blocked=cycle?.error||cycle?.results?.find(x=>x.error)?.error;if(blocked)throw Error('Monitoramento salvo como ativo, mas os ajustes estão bloqueados: '+blocked);message(inSchedule(Date.now(),c)?`Monitoramento habilitado em ${c.mode==='live'?'EXECUÇÃO':'SIMULAÇÃO'}. Confira o resultado do primeiro ciclo.`:'Monitoramento habilitado. Aguarda o horário programado.');}
    else message('Configuração salva e conferida. Monitoramento pausado.');
  }catch(e){const hint=/significado do campo Tempo/.test(e.message)?' Em Parâmetros, confirme o significado do campo Tempo antes de ativar Execução.':'';message('Não foi possível concluir: '+e.message+hint,true);showPending();}
  finally{saving=false;$('save').disabled=false;$('startMonitor').disabled=false;}
}
$('save').onclick=()=>saveAndApply(false);
$('startMonitor').onclick=()=>saveAndApply(true);
$('pause').onclick=()=>action(async()=>{const r=await call({type:'PAUSE'});$('enabled').checked=false;message(r.message);});
$('tick').onclick=()=>action(async()=>{message('Consultando a configuração SALVA…');const r=await call({type:'TICK'});if(r.error)throw Error(r.error);await refresh();});
$('verify').onclick=()=>action(async()=>{const r=await call({type:'REVERIFY'});if(r.error)throw Error(r.error);message(`${r.count} envio(s) revalidado(s), sem reenvio.`);await refresh();});
$('refresh').onclick=()=>action(async()=>{tabs=await call({type:'TABS'});draw();await refresh();});
$('addSource').onclick=()=>{config.sources.push({id:'cozinha-'+(config.sources.length+1),name:'Nova cozinha',storeId:'',tabId:null});draw();};
$('addTarget').onclick=()=>{config.targets.push({id:'',name:'',sourceId:config.sources[0]?.id,enabled:false,tabId:null,semanticsConfirmed:false,maxMinutes:120,feeMode:'preserve',feeRules:[],timeMode:'oldest',deliveryMode:'distance',averageDeliveryMinutes:15,adjustStepMinutes:5,volumeMetric:'kitchen',volumeRules:[],maxFee:30,decreaseStepFee:1,bands:[{km:0.5,minutes:15,distanceMinutes:0,fee:null}]});draw();};
$('export').onclick=()=>action(async()=>{const c=readForm();const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download='jose-configuracao.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
$('import').onchange=()=>action(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>200000)throw Error('Arquivo grande demais.');config=validate(migrate(JSON.parse(await f.text())));config.enabled=false;config.mode='simulate';config.targets.forEach(t=>t.tabId=null);config.sources.forEach(s=>s.tabId=null);loadForm();message('Configuração carregada em simulação e pausada. Vincule as abas e salve.');});
for(const [id,type] of [['testSaipos','TEST_SAIPOS'],['testIfood','TEST_IFOOD']])$(id).onclick=()=>action(async()=>{
  $(id).disabled=true;message('Lendo os vínculos salvos, sem alterar dados...');
  try{const r=await call({type,targetId:config.profile.targetId});if(r.error&&!('ok' in r))throw Error(r.error);showTests(await call({type:'TEST_RESULTS'}));message(r.ok?'Leitura concluída.':r.error,!r.ok);await refresh();}finally{$(id).disabled=false;}
});
$('exportTests').onclick=()=>action(async()=>{const d=await call({type:'STATE'}),tests=await call({type:'TEST_RESULTS'}),report=diagnosticReport(d,tests,chrome.runtime.getManifest().version);const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download='jose-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);});
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

$('linkAccounts').onclick=()=>action(async()=>{
  $('linkAccounts').disabled=true;message('Conferindo e vinculando as duas abas abertas...');
  try{const target=config.targets.find(t=>t.id===config.profile.targetId),source=config.sources.find(s=>s.id===target?.sourceId);const r=await call({type:'LINK_ACCOUNTS',targetId:config.profile.targetId,saiposTabId:source?.tabId??null,ifoodTabId:target?.tabId??null});if(r.error)throw Error(r.error);
    for(const s of config.sources){const linked=r.config.sources.find(x=>x.id===s.id);if(linked)s.tabId=linked.tabId;}
    for(const t of config.targets){const linked=r.config.targets.find(x=>x.id===t.id);if(linked){t.tabId=linked.tabId;if(!r.preserved)t.enabled=linked.enabled;}}
    if(!r.preserved){config.enabled=r.config.enabled;config.mode=r.config.mode;$('enabled').checked=config.enabled;$('mode').value=config.mode;}
    tabs=await call({type:'TABS'});draw();await refresh();message(r.preserved?'Saipos e iFood reconectados. Modo, monitoramento e opções em edição foram mantidos. Vincular não inicia nem pausa a operação.':'Nova loja vinculada. Monitoramento pausado; revise e salve antes de ativar.');
  }catch(e){await refresh();throw e;}finally{$('linkAccounts').disabled=false;}
});

$('openBoth').onclick=()=>action(async()=>{
  $('openBoth').disabled=true;
  try{const r=await call({type:'OPEN_BOTH'});if(r.error)throw Error(r.error);tabs=await call({type:'TABS'});draw();message(`${r.created} página(s) aberta(s), ${r.reused} já aberta(s). Faça login nas duas plataformas e depois clique Vincular Saipos + iFood.`);}finally{$('openBoth').disabled=false;}
});

document.addEventListener?.('change',()=>showPending());
