import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../extension/core.mjs';
let listener,store={},messages=[],alarms=[];
const clone=x=>structuredClone(x);
globalThis.chrome={
  storage:{local:{get:async keys=>Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,clone(store[k])])),set:async patch=>Object.assign(store,clone(patch))}},
  runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:f=>listener=f},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
  alarms:{create:async(...a)=>alarms.push(a),onAlarm:{addListener(){}}},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  tabs:{get:async id=>{if(id===1)return {id,url:'https://conta.saipos.com/#/app/sale/delivery/kanban/search-customer',status:'complete'};if(id===2)return {id,url:'https://portal.ifood.com.br/merchant-delivery-core-portal-experience',status:'complete'};throw Error('missing');},query:async()=>[],reload:async()=>{},sendMessage:async(id,m)=>{
    messages.push(m);
    if(m.type==='SAIPOS_READ')return {storeId:'65416',capturedAt:Date.now(),complete:true,count:0,cards:[]};
    if(m.type==='JOSE_EXECUTE')return {ok:true,unchanged:true,expected:m.rows.map(b=>({...b,fee:6.99}))};
    if(m.type==='JOSE_VERIFY')return {ok:true};
    throw Error('Unexpected message');
  }}
};
await import('../extension/background.mjs');
const call=m=>new Promise(resolve=>listener(m,{id:'test-extension',url:'chrome-extension://test-extension/options.html'},resolve));
function setup(mode='simulate'){
  const c=defaults();c.enabled=true;c.mode=mode;c.schedule={days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'};
  c.sources[0].tabId=1;c.targets=c.targets.slice(0,1);Object.assign(c.targets[0],{enabled:true,tabId:2,semanticsConfirmed:true});
  // Manual simulation ignores the clock; live tests set a window containing now.
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:c.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  if(p==='23:59')c.schedule={days:[0,1,2,3,4,5,6],start:'23:58',end:'23:57'};
  store={config:c,states:{},logs:[]};messages=[];
}
test('simulation reads Saipos but never sends Portal commands',async()=>{setup();const r=await call({type:'TICK'});assert.equal(r.results[0].mode,'simulate');assert.deepEqual(messages.map(m=>m.type),['SAIPOS_READ']);});
test('paused live mode does not execute even on manual tick',async()=>{setup('live');store.config.enabled=false;await call({type:'TICK'});assert.equal(messages.length,0);});
test('live confirmed no-op clears pending and records confirmation',async()=>{setup('live');const r=await call({type:'TICK'});assert.equal(r.results[0].verified,true);assert.equal(store.states['live:3148479'].pending,undefined);assert.equal(store.logs[0].type,'unchanged');});
test('unresolved job blocks resend after worker recovery',async()=>{setup('live');store.states['live:3148479']={offset:10,pending:{job:{target:store.config.targets[0],rows:[{km:.5,minutes:25,fee:null}]},offset:10,lowerCount:0}};await call({type:'TICK'});assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,0);const r=await call({type:'REVERIFY'});assert.equal(r.count,1);assert.equal(messages.filter(m=>m.type==='JOSE_EXECUTE').length,0);assert.equal(store.states['live:3148479'].pending,undefined);});
test('configuration cannot bypass unresolved operations',async()=>{setup();store.states.x={pending:{}};const r=await call({type:'SAVE',config:store.config});assert.match(r.error,/pendentes/);});
test('failed source resets reduction count and retains last offset',async()=>{setup();store.config.sources[0].storeId='999';store.states['simulate:3148479']={offset:20,lowerCount:1};const r=await call({type:'TICK'});assert.ok(r.results[0].error);assert.equal(store.states['simulate:3148479'].offset,20);assert.equal(store.states['simulate:3148479'].lowerCount,0);});
test('content scripts cannot invoke administrative controls',async()=>{let responded=false;const result=listener({type:'PAUSE'},{id:'test-extension',url:'https://conta.saipos.com/',tab:{id:1}},()=>responded=true);assert.equal(result,undefined);assert.equal(responded,false);});
