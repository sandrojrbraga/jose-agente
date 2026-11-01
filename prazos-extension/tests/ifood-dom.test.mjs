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

test('pinned profile refuses a different current store before any selector or write',async()=>{
  const {document,header}=setup(),window={},callbacks=[];let clicks=0;header.click=()=>clicks++;
  const context={window,document,location:{pathname:'/merchant-delivery-core-portal-experience'},chrome:{runtime:{id:'test',onMessage:{addListener:f=>callbacks.push(f),removeListener(){}}}},setTimeout};
  vm.runInNewContext(helper,context);vm.runInNewContext(content,context);
  const r=await new Promise(resolve=>callbacks[0]({type:'JOSE_EXECUTE',expiresAt:Date.now()+60000,target:{id:'3179932',name:'Pizza Pizza - Parangaba',profilePinned:true},rows:[]},{id:'test'},resolve));
  assert.match(r.error,/loja selecionada mudou/);assert.equal(clicks,0);
});
test('content executor fills demand fee and preserves fees in preserve mode',async()=>{
  for(const mode of ['demand','preserve']){
    let saved=0,listener;const window={};
    const save={...visible,innerText:'Salvar',disabled:true,click(){saved++;this.disabled=true;}};
    class Input {constructor(value){this._value=value;this.disabled=false;}get value(){return this._value;}set value(v){this._value=v;}dispatchEvent(){}blur(){save.disabled=false;}}
    const time=new Input('19'),fee=new Input('6,99'),search=new Input('');
    const label={innerText:'Pizza Pizza - Maraponga'};
    const header={...visible,innerText:label.innerText,querySelector:()=>label,click(){}};label.closest=()=>header;
    const swap={...visible,innerText:'Trocar loja',click(){}};
    const option={...visible,innerText:'Pizza Pizza - Maraponga ID 3148479',click(){save.disabled=true;}};
    const row={...visible,innerText:'0.5 km',querySelector:s=>s.includes('.time')?time:fee};
    const document={querySelector:s=>s.includes('status-indicator-v2')?header:s.includes('restaurant-profile-name')?label:s.includes('Busque pelo nome ou ID')?search:null,querySelectorAll:s=>s==='button'?[header,swap,save]:s==='[role="option"]'?[option]:s==='[aria-label="table-row"]'?[row]:[]};
    const context={window,document,HTMLInputElement:Input,Event:class{},location:{pathname:'/merchant-delivery-core-portal-experience'},chrome:{runtime:{id:'test',onMessage:{addListener:f=>listener=f,removeListener(){}}}},setTimeout:f=>setTimeout(f,0)};
    vm.runInNewContext(helper,context);vm.runInNewContext(content,context);
    const r=await new Promise(resolve=>listener({type:'JOSE_EXECUTE',expiresAt:Date.now()+60000,target:{id:'3148479',name:label.innerText,profilePinned:true,feeMode:mode,semanticsConfirmed:true,maxMinutes:120,maxFee:30},rows:[{km:.5,minutes:33,fee:9.99}]},{id:'test'},resolve));
    assert.equal(r.error,undefined);assert.equal(r.ok,true);assert.equal(saved,1);assert.equal(time.value,'33');assert.equal(fee.value,mode==='demand'?'9,99':'6,99');assert.equal(r.expected[0].fee,mode==='demand'?9.99:6.99);
  }
});
test('import and revalidation read the already-open table without selecting a store',async()=>{
  const {document,header}=setup(),window={},callbacks=[];let clicks=0;header.click=()=>clicks++;
  const context={window,document,location:{pathname:'/merchant-delivery-core-portal-experience'},chrome:{runtime:{id:'test',onMessage:{addListener:f=>callbacks.push(f),removeListener(){}}}},setTimeout};
  vm.runInNewContext(helper,context);vm.runInNewContext(content,context);
  const target={name:'Pizza Pizza - Maraponga',id:'3148479',profilePinned:true};
  for(const type of ['JOSE_READ','JOSE_VERIFY']){const r=await new Promise(resolve=>callbacks[0]({type,target,expected:[{km:.5,minutes:25,fee:6.99}]},{id:'test'},resolve));assert.equal(r.error,undefined);assert.equal(r.ok,true);assert.equal(r.rows[0].minutes,25);}
  assert.equal(clicks,0);
});

test('CSS-hidden Portal dialogs with layout rectangles are not treated as visible',()=>{
 const window={};vm.runInNewContext(helper,{window,getComputedStyle:e=>e.style});
 const hidden={...visible,style:{display:'flex',visibility:'hidden',opacity:'0'}};
 assert.equal(hidden.getClientRects().length,1);assert.equal(window.JoseIfoodDom.visible(hidden),false);
 assert.equal(window.JoseIfoodDom.visible({...visible,style:{display:'flex',visibility:'visible',opacity:'1'}}),true);
});
async function menuScenario({initiallyOpen=false,unknown=false,backdropMissing=false,toastMode=null,expireDuringDelay=false}={}){
 let menuOpen=initiallyOpen,selectorOpen=false,closed=0,writes=0,saves=0,listener;const delays=[];let clockNow=Date.now();
 const statuses=toastMode==='stale'?[{...visible,innerText:'Taxa e tempo alterados com sucesso!'}]:[];
 const window={},label={innerText:'Pizza Pizza - Maraponga'};
 const backdrop={...visible,click(){menuOpen=false;closed++;}};
 const menu={getClientRects:()=>menuOpen?[{}]:[],querySelector:()=>backdropMissing?null:backdrop};
 const searchDialog={getClientRects:()=>selectorOpen?[{}]:[]};
 const hiddenDialog={...visible,style:{display:'flex',visibility:'hidden',opacity:'0'}};
 const save={...visible,innerText:'Salvar',disabled:true,click(){assert.equal(menuOpen,false);assert.equal(selectorOpen,false);saves++;this.disabled=!toastMode;if(toastMode==='fresh')statuses.push({...visible,innerText:'Taxa e tempo alterados com sucesso!'});}};
 class Input{constructor(value){this._value=value;this.disabled=false;}get value(){return this._value;}set value(v){this._value=v;}dispatchEvent(){}blur(){if(this!==search){assert.equal(menuOpen,false);assert.equal(selectorOpen,false);writes++;}save.disabled=false;}}
 const time=new Input('19'),fee=new Input('6,99'),search=new Input('');
 const header={...visible,innerText:label.innerText,querySelector:()=>label,click(){menuOpen=!menuOpen;}};label.closest=()=>header;
 const swap={getClientRects:()=>menuOpen?[{}]:[],innerText:'Trocar loja',closest:()=>menu,click(){menuOpen=false;selectorOpen=true;}};
 const option={getClientRects:()=>selectorOpen?[{}]:[],innerText:'Pizza Pizza - Maraponga ID 3148479',click(){selectorOpen=false;menuOpen=true;save.disabled=true;}};
 const row={...visible,innerText:'0.5 km',querySelector:s=>s.includes('.time')?time:fee};
 const document={querySelector:s=>s.includes('status-indicator-v2')?header:s.includes('restaurant-profile-name')?label:s.includes('Busque pelo nome ou ID')?search:null,querySelectorAll:s=>s==='button'?[header,swap,save]:s==='[role="option"]'?[option]:s==='[aria-label="table-row"]'?[row]:s==='[role="dialog"][aria-modal="true"]'?[menu,searchDialog,hiddenDialog,...(unknown?[visible]:[])]:s==='[role="status"], [role="alert"]'?statuses:[]};
 const context={window,document,HTMLInputElement:Input,Event:class{},getComputedStyle:e=>e.style||{display:'block',visibility:'visible',opacity:'1'},location:{pathname:'/merchant-delivery-core-portal-experience'},chrome:{runtime:{id:'test',onMessage:{addListener:f=>listener=f,removeListener(){}}}},setTimeout:(f,ms)=>{delays.push(ms);if(expireDuringDelay)clockNow+=ms;return setTimeout(f,0);}};
 if(expireDuringDelay)context.Date={now:()=>clockNow};
 if(toastMode==='stale'){let clock=Date.now();context.Date={now:()=>clock+=1000};}
 vm.runInNewContext(helper,context);vm.runInNewContext(content,context);
 const result=await new Promise(resolve=>listener({type:'JOSE_EXECUTE',expiresAt:Date.now()+(expireDuringDelay?2500:60000),target:{id:'3148479',name:label.innerText,profilePinned:true,feeMode:'preserve',semanticsConfirmed:true,maxMinutes:120,maxFee:30,adjustStepMinutes:3},rows:[{km:.5,minutes:22,fee:6.99}]},{id:'test'},resolve));
 return {result,menuOpen,closed,writes,saves,delays};
}
test('store menu remaining open after ID selection closes before filling or saving',async()=>{
 const r=await menuScenario();assert.equal(r.result.ok,true);assert.equal(r.closed,1);assert.equal(r.menuOpen,false);assert.equal(r.writes,1);assert.equal(r.saves,1);
});
test('store menu already open at cycle start is closed and selection restarts safely',async()=>{
 const r=await menuScenario({initiallyOpen:true});assert.equal(r.result.ok,true);assert.equal(r.closed,2);assert.equal(r.saves,1);
});
test('unrecognized modal blocks before effects',async()=>{
 for(const opts of [{unknown:true}]){
  const r=await menuScenario(opts);assert.ok(r.result.error);assert.equal(r.writes,0);assert.equal(r.saves,0);
 }
});

test('real Portal success notification confirms submission even when Save remains enabled',async()=>{
 const r=await menuScenario({toastMode:'fresh'});assert.equal(r.result.ok,true);assert.equal(r.saves,1);assert.equal(r.result.submitted,true);
});
test('a pre-existing success notification never confirms a new uncertain command',async()=>{
 const r=await menuScenario({toastMode:'stale'});assert.equal(r.result.ok,undefined);assert.equal(r.result.uncertain,true);assert.match(r.result.error,/Sem confirmação/);assert.equal(r.saves,1);
});

test('every automated iFood click waits 3000 ms, including store menu and Save',async()=>{
 const r=await menuScenario({initiallyOpen:true});assert.equal(r.result.ok,true);assert.equal(r.delays.filter(ms=>ms===3000).length,r.closed+r.saves+3);
});
test('source expiring during click delay aborts before selector or write',async()=>{
 const r=await menuScenario({expireDuringDelay:true});assert.match(r.result.error,/venceu/);assert.equal(r.saves,0);assert.equal(r.writes,0);assert.equal(r.closed,0);
});

test('compact Portal without clickable status backdrop closes known menu through header toggle',async()=>{
 const r=await menuScenario({initiallyOpen:true,backdropMissing:true});assert.equal(r.result.ok,true);assert.equal(r.menuOpen,false);assert.equal(r.saves,1);
});
