(() => {
  if(window.joseIfoodVersion===5)return;
  if(window.joseIfoodListener)chrome.runtime.onMessage.removeListener(window.joseIfoodListener);
  window.joseIfoodVersion=5;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>!!e&&e.getClientRects().length>0;
  const text=e=>e.innerText.trim().replace(/\s+/g,' ');
  const normalized=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&text(e)===label);
  const header=()=>window.JoseIfoodDom.header(document);
  const storeName=()=>window.JoseIfoodDom.name(header());
  async function until(fn,label,ms=12000) {
    const end=Date.now()+ms;
    while(Date.now()<end){const v=fn();if(v)return v;await pause(200);}
    throw Error(label);
  }
  function setInput(e,value){
    if(!e||e.disabled)throw Error('Campo ausente ou desabilitado.');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();
  }
  const amount=s=>Number(String(s).replace(',','.'));
  function readRows(){
    const rows=[...document.querySelectorAll('[aria-label="table-row"]')].filter(visible);
    if(!rows.length)throw Error('Tabela de entrega não encontrada.');
    return rows.map(e=>{
      const radii=[...e.innerText.matchAll(/(\d+(?:[.,]\d+)?)\s*km/g)].map(m=>amount(m[1]));
      if(!radii.length||radii.length>2)throw Error('Faixa de raio não reconhecida.');
      const time=e.querySelector('input[name$=".time"]'),fee=e.querySelector('input[name$=".fee"]');
      if(!time||!fee||!Number.isFinite(amount(time.value))||!Number.isFinite(amount(fee.value)))throw Error('Formato da tabela mudou.');
      return {km:Math.max(...radii),minutes:amount(time.value),fee:amount(fee.value),timeInput:time,feeInput:fee};
    });
  }
  function checkHeader(target){
    if(!header()||normalized(storeName())!==normalized(target.name))throw Error('A loja selecionada mudou. Operação interrompida.');
  }
  async function selectTarget(t){
    if(!/^\d+$/.test(t.id)||!t.name)throw Error('Destino inválido.');
    if(t.profilePinned)checkHeader(t);
    const save=button('Salvar');if(save&&!save.disabled)throw Error('Há alterações não salvas no Portal. Não serão substituídas.');
    (await until(header,'Cabeçalho da loja ausente.')).click();
    const swap=await until(()=>[...document.querySelectorAll('button')].find(e=>visible(e)&&text(e).includes('Trocar loja')),'Seletor de loja indisponível.');
    swap.click();
    const search=await until(()=>document.querySelector('input[placeholder="Busque pelo nome ou ID"]'),'Busca de lojas indisponível.');
    setInput(search,t.id);
    const option=await until(()=>[...document.querySelectorAll('[role="option"]')].find(e=>visible(e)&&new RegExp('ID\\s*'+t.id+'(?!\\d)').test(text(e))),'ID iFood não encontrado.');
    if(!normalized(text(option)).includes(normalized(t.name)))throw Error('Nome e ID iFood não correspondem.');
    option.click();
    await until(()=>header()&&normalized(storeName())===normalized(t.name),'A loja não terminou de carregar.');
    // A troca de loja pode remontar o conteúdo depois do cabeçalho.
    await pause(900);
    await until(()=>{try{return readRows().length>0;}catch{return false;}},'Tabela não carregada.');
    checkHeader(t);
    return readRows();
  }
  const publicRows=rows=>rows.map(({km,minutes,fee})=>({km,minutes,fee}));
  async function execute(m){
    if(!location.pathname.includes('merchant-delivery-core-portal-experience'))throw Error('Abra Configurações de entrega do iFood.');
    if(Date.now()>m.expiresAt)throw Error('Cálculo vencido.');
    const before=await selectTarget(m.target);
    if(before.length!==m.rows.length||before.some((b,i)=>b.km!==m.rows[i].km))throw Error('Cadastre exatamente todas as faixas existentes, na mesma ordem.');
    if(m.preview)return {ok:true,storeId:m.target.id,before:publicRows(before)};
    if(!m.target.semanticsConfirmed)throw Error('Significado do campo Tempo não confirmado.');
    if(Date.now()>m.expiresAt)throw Error('Leitura venceu durante a seleção.');
    const expected=m.rows.map((b,i)=>({km:b.km,minutes:b.minutes,fee:m.target.feeMode!=='preserve'?b.fee:before[i].fee}));
    if(expected.some(b=>!Number.isInteger(b.minutes)||b.minutes<1||b.minutes>m.target.maxMinutes||!Number.isFinite(b.fee)||b.fee<0||(m.target.feeMode==='demand'&&b.fee>m.target.maxFee)))throw Error('Valores fora dos limites.');
    if(before.every((b,i)=>b.minutes===expected[i].minutes&&b.fee===expected[i].fee))return {ok:true,unchanged:true,storeId:m.target.id,expected};
    let submitted=false;
    try {
      for(let i=0;i<before.length;i++){
        checkHeader(m.target);if(Date.now()>m.expiresAt)throw Error('Cálculo vencido antes de salvar.');
        setInput(before[i].timeInput,expected[i].minutes);
        if(m.target.feeMode!=='preserve')setInput(before[i].feeInput,expected[i].fee.toFixed(2).replace('.',','));
      }
      await pause(250);checkHeader(m.target);
      if(!readRows().every((b,i)=>b.minutes===expected[i].minutes&&b.fee===expected[i].fee))throw Error('Preenchimento não persistiu na tela.');
      if(document.querySelector('input[aria-invalid="true"]'))throw Error('O Portal rejeitou um dos valores.');
      const save=button('Salvar');if(!save||save.disabled)throw Error('Botão Salvar não está disponível.');
      if(Date.now()>m.expiresAt)throw Error('Cálculo vencido no salvamento.');
      submitted=true;save.click();
      await until(()=>button('Salvar')?.disabled,'Sem confirmação de salvamento.');
      checkHeader(m.target);
      return {ok:true,submitted:true,storeId:m.target.id,expected,before:publicRows(before)};
    } catch(e){
      // Antes de enviar, desfazer somente o preenchimento deste comando.
      if(!submitted&&header()&&normalized(storeName())===normalized(m.target.name))button('Cancelar')?.click();
      return {error:e.message,uncertain:submitted,expected,before:publicRows(before)};
    }
  }
  const listener=(m,s,reply)=>{
    if(s.id!==chrome.runtime.id||!['JOSE_EXECUTE','JOSE_VERIFY','JOSE_READ','JOSE_INSPECT'].includes(m.type))return;
    (async()=>{
      if(m.type==='JOSE_INSPECT')return {readerVersion:5,capturedAt:Date.now(),deliveryPage:location.pathname.includes('merchant-delivery-core-portal-experience'),name:storeName(),unsaved:!!button('Salvar')&&!button('Salvar').disabled,rows:publicRows(readRows())};
      if(m.type==='JOSE_READ')return {ok:true,rows:publicRows(await selectTarget(m.target))};
      if(m.type==='JOSE_VERIFY'){
        const rows=await selectTarget(m.target);
        return {ok:rows.length===m.expected.length&&rows.every((b,i)=>b.km===m.expected[i].km&&b.minutes===m.expected[i].minutes&&(m.expected[i].fee===null||b.fee===m.expected[i].fee)),rows:publicRows(rows)};
      }
      return execute(m);
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  };
  window.joseIfoodListener=listener;
  chrome.runtime.onMessage.addListener(listener);
})();
