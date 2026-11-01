import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../extension/core.mjs';
let listener,store={},messages=[],alarms=[],injections=[],disconnected=false,executionPortClosed=false,legacyIfood=false;
const clone=x=>structuredClone(x);
globalThis.chrome={
  storage:{local:{get:async keys=>Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,clone(store[k])])),set:async patch=>Object.assign(store,clone(patch))}},
  runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:f=>listener=f},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
  alarms:{create:async(...a)=>alarms.push(a),onAlarm:{addListener(){}}},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  scripting:{executeScript:async m=>{injections.push(m);disconnected=false;legacyIfood=false;}},
  tabs:{get:async id=>{if(id===1)return {id,url:'https://conta.saipos.com/#/app/sale/delivery/kanban/search-customer',status:'complete'};if(id===2)return {id,url:'https://portal.ifood.com.br/merchant-delivery-core-portal-experience',status:'complete'};throw Error('missing');},query:async()=>[],reload:async()=>{},sendMessage:async(id,m)=>{
    messages.push(m);if(disconnected)throw Error('Receiving end does not exist.');
    if(m.type==='JOSE_EXECUTE'&&executionPortClosed)throw Error('The message port closed before a response was received.');
    if(m.type==='SAIPOS_READ')return {storeId:'65416',capturedAt:Date.now(),complete:true,count:0,cards:[]};
    if(m.type==='JOSE_EXECUTE')return {ok:true,unchanged:true,expected:m.rows.map(b=>({...b,fee:6.99}))};
    if(m.type==='JOSE_VERIFY')return {ok:true};
    if(m.type==='JOSE_INSPECT')return {readerVersion:legacyIfood?undefined:6,capturedAt:Date.now(),deliveryPage:true,name:'Pizza Pizza - Maraponga',unsaved:false,rows:[{km:.5,minutes:25,fee:6.99}]};
    throw Error('Unexpected message');
  }}
};
await import('../extension/background.mjs');
const call=m=>new Promise(resolve=>listener(m,{id:'test-extension',url:'chrome-extension://test-extension/options.html'},resolve));
function setup(mode='simulate'){
  const c=defaults();c.enabled=true;c.mode=mode;c.schedule={days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'};
  c.sources[0].tabId=1;c.targets=[c.targets.find(t=>t.id==='3148479')];Object.assign(c.targets[0],{enabled:true,tabId:2,semanticsConfirmed:true});
  // Manual simulation ignores the clock; live tests set a window containing now.
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:c.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  if(p==='23:59')c.schedule={days:[0,1,2,3,4,5,6],start:'23:58',end:'23:57'};
  store={config:c,states:{},logs:[]};messages=[];injections=[];disconnected=false;executionPortClosed=false;legacyIfood=false;
}
test('simulation reads both platforms but never sends write commands',async()=>{setup();const r=await call({type:'TICK'});assert.equal(r.results[0].mode,'simulate');assert.deepEqual(messages.map(m=>m.type),['SAIPOS_READ','JOSE_INSPECT']);});
test('paused live mode does not execute even on manual tick',async()=>{setup('live');store.config.enabled=false;await call({type:'TICK'});assert.equal(messages.length,0);});
test('live confirmed no-op clears pending and records confirmation',async()=>{setup('live');const r=await call({type:'TICK'});assert.equal(r.results[0].verified,true);assert.equal(store.states['live:3148479'].pending,undefined);assert.equal(store.logs[0].type,'unchanged');});
test('unresolved job blocks resend after worker recovery',async()=>{setup('live');store.states['live:3148479']={offset:10,pending:{job:{target:store.config.targets[0],rows:[{km:.5,minutes:25,fee:null}]},offset:10,lowerCount:0}};await call({type:'TICK'});assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,0);const r=await call({type:'REVERIFY'});assert.equal(r.count,1);assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,0);assert.equal(store.states['live:3148479'].pending,undefined);});
test('configuration cannot bypass unresolved operations',async()=>{setup();store.states.x={pending:{}};const r=await call({type:'SAVE',config:store.config});assert.match(r.error,/pendentes/);});
test('failed source resets reduction count and retains last offset',async()=>{setup();store.config.sources[0].storeId='999';store.states['simulate:3148479']={offset:20,lowerCount:1};const r=await call({type:'TICK'});assert.ok(r.results[0].error);assert.equal(store.states['simulate:3148479'].offset,20);assert.equal(store.states['simulate:3148479'].lowerCount,0);});
test('content scripts cannot invoke administrative controls',async()=>{let responded=false;const result=listener({type:'PAUSE'},{id:'test-extension',url:'https://conta.saipos.com/',tab:{id:1}},()=>responded=true);assert.equal(result,undefined);assert.equal(responded,false);});

test('existing page without receiver reconnects reader without manual reload',async()=>{setup();disconnected=true;const r=await call({type:'TICK'});assert.equal(r.results[0].mode,'simulate');assert.deepEqual(injections[0].files,['saipos-reader.js','saipos.js']);assert.equal(messages.filter(m=>m.type==='SAIPOS_READ').length,2);});
test('uncertain live result is never automatically resent while reconnecting',async()=>{setup('live');executionPortClosed=true;const r=await call({type:'TICK'});assert.ok(r.results[0].error);assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,1);assert.equal(injections.length,0);assert.ok(store.states['live:3148479'].pending);});
test('Saipos test works while paused without enabling monitoring',async()=>{setup();store.config.enabled=false;const r=await call({type:'TEST_SAIPOS',targetId:'3148479',tabId:1});assert.equal(r.ok,true);assert.equal(r.storeId,'65416');assert.equal(store.config.enabled,false);assert.deepEqual(messages.map(m=>m.type),['SAIPOS_READ']);});
test('iFood test is inspection-only, never sends store-selection or execution commands',async()=>{setup();const r=await call({type:'TEST_IFOOD',targetId:'3148479',tabId:2});assert.equal(r.ok,true);assert.equal(r.selectedIdVerified,false);assert.deepEqual(messages.map(m=>m.type),['JOSE_INSPECT']);});
test('reader profile cannot execute even if old settings requested live',async()=>{setup('live');store.config.profile.role='reader';await call({type:'TICK'});assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,0);});
test('executor-only profile reports missing bridge instead of using other profiles magically',async()=>{setup();store.config.profile.role='executor';await call({type:'TICK'});assert.equal(messages.length,0);assert.match(store.status.message,/não conectada/);});

test('fee hysteresis survives worker state and recovery; live job is pinned to profile',async()=>{
  setup('live');const t=store.config.targets[0];Object.assign(t,{feeMode:'demand',volumeRules:[{minOrders:5,extraMinutes:0,extraFee:3}],bands:[{km:.5,minutes:19,fee:6.99}]});
  store.states['live:3148479']={offset:0,lowerCount:0,feeOffsetCents:300,feeLowerCount:0};
  await call({type:'TICK'});assert.equal(messages.find(m=>m.type==='JOSE_EXECUTE').rows[0].fee,9.99);assert.equal(messages.find(m=>m.type==='JOSE_EXECUTE').target.profilePinned,true);
  messages=[];await call({type:'TICK'});assert.equal(messages.find(m=>m.type==='JOSE_EXECUTE').rows[0].fee,8.99);
  executionPortClosed=true;await call({type:'TICK'});const pending=store.states['live:3148479'].pending;assert.equal(pending.feeOffsetCents,200);
  await call({type:'REVERIFY'});assert.equal(store.states['live:3148479'].feeOffsetCents,200);
});
test('source failure resets fee reduction streak while preserving previous fee',async()=>{
  setup();store.config.sources[0].storeId='999';store.states['simulate:3148479']={offset:20,lowerCount:1,feeOffsetCents:300,feeLowerCount:1};await call({type:'TICK'});assert.equal(store.states['simulate:3148479'].feeOffsetCents,300);assert.equal(store.states['simulate:3148479'].feeLowerCount,0);
});

test('legacy iFood content upgrades with inspection before a fee-writing command',async()=>{setup('live');legacyIfood=true;await call({type:'TICK'});assert.deepEqual(injections[0].files,['ifood-dom.js','ifood.js']);const types=messages.map(m=>m.type);assert.deepEqual(types,['SAIPOS_READ','JOSE_INSPECT','JOSE_INSPECT','JOSE_INSPECT','JOSE_EXECUTE','JOSE_INSPECT']);});
test('direct iFood read works paused, reports latency and never sends write commands',async()=>{setup();store.config.enabled=false;const r=await call({type:'READ_IFOOD'});assert.equal(r.ok,true);assert.equal(r.targetId,'3148479');assert.equal(r.rows[0].fee,6.99);assert.ok(r.latencyMs>=0);assert.deepEqual(messages.map(m=>m.type),['JOSE_INSPECT']);assert.equal(store.config.enabled,false);assert.equal(store.portal.tabId,2);});
test('wrong-store iFood read replaces previous green state with explicit failure',async()=>{setup();await call({type:'READ_IFOOD'});store.config.targets[0].name='Pizza Pizza - Parangaba';const r=await call({type:'READ_IFOOD'});assert.equal(r.ok,false);assert.match(r.error,/Loja diferente/);assert.equal(store.portal.ok,false);assert.equal(store.portal.rows,undefined);assert.equal(messages.some(m=>m.type==='JOSE_EXECUTE'),false);});
