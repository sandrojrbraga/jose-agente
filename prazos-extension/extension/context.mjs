// Chrome compartilha storage entre processos split. Este adaptador separa os dados.
export function contextStore(chrome,incognito){
  const area=incognito?chrome.storage.session:chrome.storage.local;
  if(!area)throw Error('Armazenamento deste ambiente indisponível. Atualize o Chrome.');
  const key=k=>incognito?'jose:incognito:'+k:k;
  return {
    async get(keys){const data=await area.get(keys.map(key));return Object.fromEntries(keys.filter(k=>key(k) in data).map(k=>[k,data[key(k)]]));},
    async set(patch){await area.set(Object.fromEntries(Object.entries(patch).map(([k,v])=>[key(k),v])));}
  };
}
export const sameContext=(surface,incognito)=>!!surface?.incognito===incognito;
export function contextTabs(chrome,incognito){
  return async query=>(await chrome.tabs.query(query)).filter(tab=>sameContext(tab,incognito));
}
export async function ownedTab(chrome,id,incognito){
  const tab=await chrome.tabs.get(id);
  if(!tab)throw Error('Aba não encontrada. Reabra o site para reconectar.');
  if(!sameContext(tab,incognito))throw Error('Aba de outro ambiente: janela normal e anônima não podem compartilhar vínculos.');
  return tab;
}
export const LOGIN_PAGES=[
 'https://conta.saipos.com/#/app/sale/delivery/kanban/search-customer',
 'https://portal.ifood.com.br/merchant-delivery-core-portal-experience'
];
export async function openContextPages(chrome,incognito,urls,sender={},activate=false){
  let window;
  if(Number.isInteger(sender.tab?.windowId)){
    window=await chrome.windows.get(sender.tab.windowId);
    if(!sameContext(window,incognito))throw Error('Abra o painel no ambiente correto.');
  }else{
    try{const last=await chrome.windows.getLastFocused();if(sameContext(last,incognito))window=last;}catch{}
    if(!window)window=(await chrome.windows.getAll()).find(w=>sameContext(w,incognito));
  }
  if(!window){const w=await chrome.windows.create({incognito,url:urls});return {ok:true,created:urls.length,reused:0,windowId:w.id};}
  const all=await contextTabs(chrome,incognito)({});
  // Planejar antes de abrir para não criar metade do par quando já há duplicatas.
  const entries=urls.map(url=>{
    const expected=new URL(url);
    const matches=all.filter(t=>{try{const parsed=new URL(t.url||t.pendingUrl);return parsed.protocol===expected.protocol&&parsed.host===expected.host&&(expected.protocol!=='chrome-extension:'||parsed.pathname===expected.pathname);}catch{return false;}});
    if(matches.length>1)throw Error('Há abas duplicadas deste site no ambiente atual. Feche as duplicatas antes de abrir/vincular.');
    return {url,tab:matches[0]};
  });
  let created=0,reused=0;const tabIds=[];
  for(const entry of entries){
    if(entry.tab){tabIds.push(entry.tab.id);reused++;}
    else{const tab=await chrome.tabs.create({windowId:window.id,url:entry.url,active:false});tabIds.push(tab.id);created++;}
  }
  if(activate&&tabIds.length){const tab=await ownedTab(chrome,tabIds[0],incognito);await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});}
  return {ok:true,created,reused,tabIds,windowId:window.id};
}
export async function resolvePortalTab(chrome,incognito,target){
  const previousTabId=target.tabId;let bound;
  if(Number.isInteger(previousTabId)){try{bound=await chrome.tabs.get(previousTabId);}catch{}}
  if(bound&&!sameContext(bound,incognito))throw Error('A aba iFood vinculada pertence a outro ambiente. Escolha uma aba deste ambiente.');
  const delivery='https://portal.ifood.com.br/merchant-delivery-core-portal-experience';
  if(bound?.url?.startsWith(delivery))return {tab:bound,recovered:false,previousTabId};
  const candidates=(await contextTabs(chrome,incognito)({url:[delivery+'*']})).filter(t=>t.url?.startsWith(delivery));
  if(!candidates.length)throw Error('A aba iFood vinculada foi fechada ou não está na tela de Entrega. Abra essa tela no mesmo ambiente para reconectar automaticamente.');
  if(candidates.length!==1)throw Error('Há mais de uma aba iFood de Entrega neste ambiente. Escolha a correta em Cadastro e vincule.');
  return {tab:candidates[0],recovered:true,previousTabId};
}
