import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaults,migrate,validate,inSchedule} from '../extension/core.mjs';
import {connection,comparisonRows} from '../extension/view.mjs';
async function dashboard({initial=defaults(),confirmation=true,saveError=null,ignoreSave=false}={}){
 const html=fs.readFileSync(new URL('../extension/options.html',import.meta.url),'utf8');
 const code=fs.readFileSync(new URL('../extension/options.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.value='';this.hidden=false;this.attributes={};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}addEventListener(name,fn){this['on'+name]=fn;}setAttribute(key,value){this.attributes[key]=value;}}
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id)])),pages=['operation','setup','parameters'].map(id=>Object.assign(nodes[id],{id,hidden:id!=='operation'})),buttons=pages.map(p=>Object.assign(new Element('button'),{dataset:{page:p.id}}));
 const document={hidden:false,getElementById:id=>{assert.ok(nodes[id],`missing control ${id}`);return nodes[id];},createElement:tag=>new Element(tag),querySelectorAll:s=>s==='.page'?pages:s==='[data-page]'?buttons:[]};
 const messages=[],state={config:structuredClone(initial),logs:[],status:{},portal:null};let confirmations=0;
 const chrome={runtime:{sendMessage:async m=>{messages.push(structuredClone(m));if(m.type==='STATE')return structuredClone(state);if(m.type==='TABS')return [];if(m.type==='TEST_RESULTS')return {};if(m.type==='LINK_ACCOUNTS')return {ok:true,preserved:true,config:structuredClone(state.config)};if(m.type==='READ_IFOOD')return {ok:false,error:'Sem aba'};if(m.type==='SAVE'){if(saveError)return {error:saveError};if(!ignoreSave)state.config=structuredClone(m.config);return {ok:true};}if(m.type==='TICK'){state.status={at:Date.now(),message:'Ciclo de teste',results:[]};return state.status;}throw Error('unexpected '+m.type);}}};
 await vm.runInNewContext('(async()=>{'+code+'})()',{document,chrome,defaults,migrate,validate,inSchedule,connection,comparisonRows,console,setTimeout,setInterval(){},confirm(){confirmations++;return confirmation;}});
 return {nodes,state,messages,buttons,confirmations:()=>confirmations};
}
test('dashboard boots read-only, preserves edits and same-store relink activation',async()=>{
 const {nodes,state,messages,buttons}=await dashboard();assert.ok(messages.some(m=>m.type==='READ_IFOOD'));assert.ok(!messages.some(m=>m.type==='SAVE'||m.type==='TICK'));
 buttons[1].onclick();assert.equal(nodes.setup.hidden,false);assert.equal(nodes.operation.hidden,true);
 nodes.profileLabel.value='Edição não salva';await nodes.readIfood.onclick();assert.equal(nodes.profileLabel.value,'Edição não salva');assert.equal(nodes.pendingNotice.hidden,false);assert.equal(nodes.monitorState.textContent,'Pausado');
 state.config.enabled=true;state.config.mode='live';nodes.enabled.checked=true;nodes.mode.value='live';await nodes.linkAccounts.onclick();assert.equal(nodes.enabled.checked,true);assert.equal(nodes.mode.value,'live');assert.equal(messages.some(m=>m.type==='SAVE'),false);
});
test('start enables selected store and persists activation before requesting first cycle',async()=>{
 const initial=defaults();initial.targets.forEach(t=>t.enabled=false);const {nodes,state,messages}=await dashboard({initial});await nodes.startMonitor.onclick();assert.equal(state.config.enabled,true);assert.equal(state.config.targets.find(t=>t.id===initial.profile.targetId).enabled,true);assert.equal(state.config.mode,'simulate');assert.ok(messages.findIndex(m=>m.type==='SAVE')<messages.findIndex(m=>m.type==='TICK'));assert.equal(nodes.pendingNotice.hidden,true);
});
test('missing live semantic confirmation is shown at save button without claiming activation',async()=>{
 const {nodes,state,messages}=await dashboard();nodes.mode.value='live';await nodes.startMonitor.onclick();assert.equal(state.config.enabled,false);assert.match(nodes.saveMessage.textContent,/confirme o significado/i);assert.equal(messages.some(m=>m.type==='SAVE'),false);assert.equal(nodes.monitorState.textContent,'Pausado');
});
test('save-and-apply persists marked execution and verifies storage',async()=>{
 const initial=defaults();initial.targets.find(t=>t.enabled).semanticsConfirmed=true;const {nodes,state,messages,confirmations}=await dashboard({initial});nodes.mode.value='live';nodes.enabled.checked=true;await nodes.save.onclick();assert.equal(state.config.enabled,true);assert.equal(state.config.mode,'live');assert.equal(confirmations(),1);assert.equal(messages.filter(m=>m.type==='SAVE').length,1);assert.ok(messages.some(m=>m.type==='TICK'));assert.notEqual(nodes.monitorState.textContent,'Pausado');
});
test('canceled live confirmation explicitly states no activation and performs no save',async()=>{
 const initial=defaults();initial.targets.find(t=>t.enabled).semanticsConfirmed=true;const {nodes,state,messages}=await dashboard({initial,confirmation:false});nodes.mode.value='live';await nodes.startMonitor.onclick();assert.equal(state.config.enabled,false);assert.match(nodes.saveMessage.textContent,/Ativação cancelada/);assert.equal(messages.some(m=>m.type==='SAVE'),false);
});
test('save rejection and failed read-back remain visible beside action; no cycle starts',async()=>{
 for(const options of [{saveError:'Aguarde o ciclo atual antes de salvar.'},{ignoreSave:true}]){const {nodes,state,messages}=await dashboard(options);await nodes.startMonitor.onclick();assert.equal(state.config.enabled,false);assert.match(nodes.saveMessage.textContent,/Não foi possível concluir/);assert.equal(messages.some(m=>m.type==='TICK'),false);assert.equal(nodes.save.disabled,false);}
});
