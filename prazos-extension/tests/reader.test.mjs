import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const reader=fs.readFileSync(new URL('../extension/saipos-reader.js',import.meta.url),'utf8');
const listener=fs.readFileSync(new URL('../extension/saipos.js',import.meta.url),'utf8');
function fixture({missingId=false,partial=false,filter=false,missingClock=false}={}){
  const cards=[{innerText:`216 - Consumidor\n31/out, 21:08 (04m)\n${missingClock?'':'Desde 21:08 (04m)'}\nR$ 37,99`,querySelector:()=>({id:'kanban-checkbox-test',getAttribute:()=>null})}];
  const headings=['Cozinha','Aguardando entrega','Saiu para entrega'].map((stage,i)=>({innerText:stage,parentElement:{querySelector:()=>({innerText:String(i?2:partial?2:1)}),querySelectorAll:()=>cards}}));
  return {querySelector:q=>q.includes('[uib-tooltip]')?(missingId?null:{getAttribute:()=> 'Pizza Pizza 08 [65416]'}):q.startsWith('input[name=')?{value:filter?'123':''}:null,querySelectorAll:()=>headings};
}
function read(doc){const window={};vm.runInNewContext(reader,{window});return window.JoseSaiposReader.read(doc,{hash:'#/app/sale/delivery/kanban/search-customer'},123456);}
test('DOM reader extracts real Saipos tooltip ID, clocks and counts without customer data',()=>{const s=read(fixture());assert.equal(s.storeId,'65416');assert.equal(s.count,1);assert.equal(s.cards[0].created,'31/out, 21:08');assert.equal(s.cards[0].since,'Desde 21:08 (04m)');assert.equal(s.capturedAt,123456);assert.equal(s.stages.length,3);assert.equal(JSON.stringify(s).includes('Consumidor'),false);});
test('incomplete rendered kitchen never becomes an empty queue',()=>{assert.throws(()=>read(fixture({partial:true})),/parcial/);});
test('missing store identity and active search filters block reading',()=>{assert.throws(()=>read(fixture({missingId:true})),/ID Saipos/);assert.throws(()=>read(fixture({filter:true})),/filtros/);});
test('listener injection is idempotent and returns explicit errors',()=>{const callbacks=[],window={},context={window,document:fixture({missingId:true}),location:{hash:'#/kanban/'},chrome:{runtime:{id:'extension',onMessage:{addListener:l=>callbacks.push(l),removeListener:()=>{}}}}};vm.runInNewContext(reader,context);vm.runInNewContext(listener,context);vm.runInNewContext(listener,context);assert.equal(callbacks.length,1);let response;callbacks[0]({type:'SAIPOS_READ'},{id:'extension'},r=>response=r);assert.equal(response.complete,false);assert.match(response.error,/ID Saipos/);});
