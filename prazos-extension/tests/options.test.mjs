import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaults,migrate,validate,inSchedule} from '../extension/core.mjs';
import {connection,comparisonRows} from '../extension/view.mjs';
test('dashboard boots, reads iFood without enabling writes, and preserves unsaved edits during refresh',async()=>{
  const html=fs.readFileSync(new URL('../extension/options.html',import.meta.url),'utf8');
  let source=fs.readFileSync(new URL('../extension/options.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.value='';this.hidden=false;this.attributes={};}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
    addEventListener(name,fn){this['on'+name]=fn;}setAttribute(key,value){this.attributes[key]=value;}
  }
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const pages=['operation','setup','parameters'].map(id=>Object.assign(nodes[id],{id,hidden:id!=='operation'}));
  const buttons=pages.map(p=>Object.assign(new Element('button'),{dataset:{page:p.id}}));
  const document={hidden:false,getElementById:id=>{assert.ok(nodes[id],`missing control ${id}`);return nodes[id];},createElement:tag=>new Element(tag),querySelectorAll:s=>s==='.page'?pages:s==='[data-page]'?buttons:[]};
  const config=defaults(),messages=[];const state={config,logs:[],status:{},portal:null};
  const chrome={runtime:{sendMessage:async m=>{messages.push(m);if(m.type==='STATE')return structuredClone(state);if(m.type==='TABS')return [];if(m.type==='TEST_RESULTS')return {};if(m.type==='READ_IFOOD')return {ok:false,error:'Sem aba'};throw Error('unexpected '+m.type);}}};
  const context={document,chrome,defaults,migrate,validate,inSchedule,connection,comparisonRows,console,setTimeout,setInterval(){},confirm(){throw Error('Unexpected confirmation');}};
  await vm.runInNewContext('(async()=>{'+source+'})()',context);
  assert.equal(nodes.message.textContent,undefined);assert.ok(messages.some(m=>m.type==='READ_IFOOD'));assert.ok(!messages.some(m=>m.type==='SAVE'||m.type==='TICK'));
  assert.equal(nodes.registration.children.length,1);assert.ok(nodes.targets.children.length>0);
  buttons[1].onclick();assert.equal(nodes.setup.hidden,false);assert.equal(nodes.operation.hidden,true);assert.equal(nodes.parameters.hidden,true);
  nodes.profileLabel.value='Edição não salva';await nodes.readIfood.onclick();assert.equal(nodes.profileLabel.value,'Edição não salva');assert.equal(nodes.monitorState.textContent,'Pausado');
});
