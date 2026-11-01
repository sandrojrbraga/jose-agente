import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const helper=fs.readFileSync(new URL('../extension/ifood-dom.js',import.meta.url),'utf8');
const content=fs.readFileSync(new URL('../extension/ifood.js',import.meta.url),'utf8');
const visible={getClientRects:()=>[{}]};
function setup({primary=true,ambiguous=false}={}){
  const label={innerText:'Pizza Pizza - Maraponga',textContent:'Pizza Pizza - Maraponga'};
  const header={...visible,innerText:label.innerText,textContent:label.textContent,querySelector:()=>primary?label:null};label.closest=()=>header;
  const save={...visible,innerText:'Salvar',disabled:true};
  const row={...visible,innerText:'0.5 km\nmin\nR$',querySelector:s=>({value:s.includes('.time')?'25':'6,99'})};
  const document={querySelector:s=>primary?(s.includes('status-indicator-v2')?header:s.includes('restaurant-profile-name')?label:null):null,querySelectorAll:s=>s==='button'?[header,save,...(ambiguous?[{...header}]:[])]:s==='[aria-label="table-row"]'?[row]:[]};
  return {document,header};
}
test('regression: real Maraponga button has CSS arrow but no arrow in its text',()=>{
  const {document,header}=setup(),window={};
  assert.equal(header.innerText.includes(''),false); // old requirement reproduces the bug
  vm.runInNewContext(helper,{window});
  assert.equal(window.JoseIfoodDom.header(document),header);
  assert.equal(window.JoseIfoodDom.name(header),'Pizza Pizza - Maraponga');
});
test('fallback without icon works only for one unambiguous store button',()=>{const window={};vm.runInNewContext(helper,{window});assert.ok(window.JoseIfoodDom.header(setup({primary:false}).document));assert.equal(window.JoseIfoodDom.header(setup({primary:false,ambiguous:true}).document),undefined);});
test('full content listener reads Maraponga and table without clicking or typing',async()=>{
  const {document}=setup(),window={},callbacks=[];
  const context={window,document,location:{pathname:'/merchant-delivery-core-portal-experience'},chrome:{runtime:{id:'test',onMessage:{addListener:f=>callbacks.push(f),removeListener(){}}}},setTimeout};
  vm.runInNewContext(helper,context);vm.runInNewContext(content,context);vm.runInNewContext(content,context);
  assert.equal(callbacks.length,1);
  const r=await new Promise(resolve=>callbacks[0]({type:'JOSE_INSPECT'},{id:'test'},resolve));
  assert.equal(r.error,undefined);assert.equal(r.name,'Pizza Pizza - Maraponga');assert.equal(r.rows[0].minutes,25);assert.equal(r.rows[0].fee,6.99);
});
