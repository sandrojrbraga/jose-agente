(() => {
  if(window.joseIfoodVersion===12)return;
  if(window.joseIfoodListener)chrome.runtime.onMessage.removeListener(window.joseIfoodListener);
  window.joseIfoodVersion=12;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>window.JoseIfoodDom.visible(e);
  const text=e=>e.innerText.trim().replace(/\s+/g,' ');
  const normalized=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const successNodes=()=>[...document.querySelectorAll('[role="status"], [role="alert"]')].filter(e=>visible(e)&&text(e).includes('Taxa e tempo alterados com sucesso!'));
  const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&text(e)===label);
  const header=()=>window.JoseIfoodDom.header(document);
  const storeName=()=>window.JoseIfoodDom.name(header());
  async function until(fn,label,ms=12000) {
    const end=Date.now()+ms;
    while(Date.now()<end){const v=fn();if(v)return v;await pause(200);}
    throw Error(label);
  }
  async function clickAfterDelay(find,guard=()=>{},beforeClick=()=>{}){
    await pause(3000);guard();
    const element=find();
    if(!visible(element)||element.disabled)throw Error('Controle de clique ausente ou desabilitado após a espera de 3 segundos.');
    element.scrollIntoView?.({block:'center',inline:'nearest'});element.focus?.();
    beforeClick();element.click();
  }
  function setInput(e,value){
    if(!e||e.disabled)throw Error('Campo ausente ou desabilitado.');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();
  }
  const amount=s=>/^\d+(?:[.,]\d+)?$/.test(String(s).trim())?Number(String(s).trim().replace(',','.')):NaN;
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
  const dialogOpen=e=>{
    if(!e||!e.getClientRects().length)return false;
    if(typeof getComputedStyle!=='function')return true;
    const style=getComputedStyle(e);return style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.display!=='none';
  };
  const activeDialogs=()=>[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(dialogOpen);
  const swapButton=()=>[...document.querySelectorAll('button')].find(e=>visible(e)&&text(e).includes('Trocar loja'));
  async function closeStoreMenu(guard=()=>{}){
    const menu=swapButton()?.closest?.('[role="dialog"]');
    if(!dialogOpen(menu))return;
    const backdrop=menu.querySelector('[role="presentation"]');
    if(visible(backdrop)){
      await clickAfterDelay(()=>menu.querySelector('[role="presentation"]'),guard);
      try{await until(()=>!dialogOpen(menu),'Menu ainda aberto.',2500);return;}catch{}
    }
    // Layout compacto/anônimo pode não expor um fundo clicável. O mesmo botão do cabeçalho alterna este menu conhecido.
    if(dialogOpen(menu))await clickAfterDelay(header,guard);
    await until(()=>!dialogOpen(menu),'O menu da loja não fechou. Nenhum valor será preenchido.');
  }
  function ensureNoDialog(){if(activeDialogs().length)throw Error('Há uma janela sobre a tela de entrega. Feche-a antes do ajuste.');}
  async function selectTarget(t,guard){
    if(!/^\d+$/.test(t.id)||!t.name)throw Error('Destino inválido.');
    if(t.profilePinned)checkHeader(t);
    const save=button('Salvar');if(save&&!save.disabled)throw Error('Há alterações não salvas no Portal. Não serão substituídas.');
    // O menu pode ter ficado aberto no ciclo anterior: fechar antes de iniciar a seleção.
    await closeStoreMenu(guard);ensureNoDialog();
    await until(header,'Cabeçalho da loja ausente.');await clickAfterDelay(header,guard);
    const swap=await until(swapButton,'Seletor de loja indisponível.');
    await clickAfterDelay(swapButton,guard);
    const search=await until(()=>document.querySelector('input[placeholder="Busque pelo nome ou ID"]'),'Busca de lojas indisponível.');
    setInput(search,t.id);
    const option=await until(()=>[...document.querySelectorAll('[role="option"]')].find(e=>visible(e)&&new RegExp('ID\\s*'+t.id+'(?!\\d)').test(text(e))),'ID iFood não encontrado.');
    if(!normalized(text(option)).includes(normalized(t.name)))throw Error('Nome e ID iFood não correspondem.');
    await clickAfterDelay(()=>[...document.querySelectorAll('[role="option"]')].find(e=>visible(e)&&new RegExp('ID\\s*'+t.id+'(?!\\d)').test(text(e))&&normalized(text(e)).includes(normalized(t.name))),guard);
    await until(()=>header()&&normalized(storeName())===normalized(t.name),'A loja não terminou de carregar.');
    // A troca de loja pode remontar o conteúdo depois do cabeçalho.
    await pause(900);
    await until(()=>{try{return readRows().length>0;}catch{return false;}},'Tabela não carregada.');
    checkHeader(t);await closeStoreMenu(guard);ensureNoDialog();
    return readRows();
  }
  const publicRows=rows=>rows.map(({km,minutes,fee})=>({km,minutes,fee}));
  async function execute(m){
    if(!location.pathname.includes('merchant-delivery-core-portal-experience'))throw Error('Abra Configurações de entrega do iFood.');
    if(Date.now()>m.expiresAt)throw Error('Cálculo vencido.');
    const guard=()=>{checkHeader(m.target);if(Date.now()>m.expiresAt)throw Error('Cálculo venceu durante a espera de 3 segundos. Aguarde uma nova leitura.');};
    const before=await selectTarget(m.target,guard);
    if(before.length!==m.rows.length||before.some((b,i)=>b.km!==m.rows[i].km))throw Error('Cadastre exatamente todas as faixas existentes, na mesma ordem.');
    if(m.preview)return {ok:true,storeId:m.target.id,before:publicRows(before)};
    if(!m.target.semanticsConfirmed)throw Error('Significado do campo Tempo não confirmado.');
    if(Date.now()>m.expiresAt)throw Error('Leitura venceu durante a seleção.');
    const expected=m.rows.map((b,i)=>({km:b.km,minutes:b.minutes,fee:m.target.feeMode!=='preserve'?b.fee:before[i].fee}));
    if(expected.some(b=>!Number.isInteger(b.minutes)||b.minutes<1||b.minutes>m.target.maxMinutes||!Number.isFinite(b.fee)||b.fee<0||(m.target.feeMode==='demand'&&b.fee>m.target.maxFee)))throw Error('Valores fora dos limites.');
    if(Number.isInteger(m.target.adjustStepMinutes)&&expected.some((b,i)=>Math.abs(b.minutes-before[i].minutes)>m.target.adjustStepMinutes))throw Error('O tempo no Portal mudou desde a leitura. Aguarde novo cálculo para respeitar o passo por ciclo.');
    if(before.every((b,i)=>b.minutes===expected[i].minutes&&b.fee===expected[i].fee))return {ok:true,unchanged:true,storeId:m.target.id,expected};
    let submitted=false;
    try {
      for(let i=0;i<before.length;i++){
        checkHeader(m.target);ensureNoDialog();if(Date.now()>m.expiresAt)throw Error('Cálculo vencido antes de salvar.');
        setInput(before[i].timeInput,expected[i].minutes);
        if(m.target.feeMode!=='preserve')setInput(before[i].feeInput,expected[i].fee.toFixed(2).replace('.',','));
      }
      await pause(250);checkHeader(m.target);ensureNoDialog();
      if(!readRows().every((b,i)=>b.minutes===expected[i].minutes&&b.fee===expected[i].fee))throw Error('Preenchimento não persistiu na tela.');
      if(document.querySelector('input[aria-invalid="true"]'))throw Error('O Portal rejeitou um dos valores.');
      const save=button('Salvar');if(!save||save.disabled)throw Error('Botão Salvar não está disponível.');
      if(Date.now()>m.expiresAt)throw Error('Cálculo vencido no salvamento.');
      let previousSuccess;
      await clickAfterDelay(()=>button('Salvar'),()=>{guard();ensureNoDialog();},()=>{previousSuccess=new Set(successNodes());submitted=true;});
      await closeStoreMenu(()=>checkHeader(m.target));
      // No Portal real, o botão pode continuar habilitado depois da mensagem de sucesso.
      // O worker ainda recarrega a página e compara cada valor antes de confirmar.
      await until(()=>button('Salvar')?.disabled||successNodes().some(e=>!previousSuccess.has(e)),'Sem confirmação de salvamento.');
      checkHeader(m.target);
      return {ok:true,submitted:true,storeId:m.target.id,expected,before:publicRows(before)};
    } catch(e){
      // Antes de enviar, desfazer somente o preenchimento deste comando.
      if(!submitted&&!activeDialogs().length&&header()&&normalized(storeName())===normalized(m.target.name)&&button('Cancelar'))await clickAfterDelay(()=>button('Cancelar'),()=>checkHeader(m.target));
      return {error:e.message,uncertain:submitted,expected,before:publicRows(before),submission:{submitted,activeDialogs:activeDialogs().length,savePresent:!!button('Salvar'),saveDisabled:button('Salvar')?.disabled??null,invalidFields:!!document.querySelector('input[aria-invalid="true"]')}};
    }
  }
  const listener=(m,s,reply)=>{
    if(s.id!==chrome.runtime.id||!['JOSE_EXECUTE','JOSE_VERIFY','JOSE_READ','JOSE_INSPECT'].includes(m.type))return;
    (async()=>{
      if(m.type==='JOSE_INSPECT')return {readerVersion:12,capturedAt:Date.now(),deliveryPage:location.pathname.includes('merchant-delivery-core-portal-experience'),name:storeName(),unsaved:!!button('Salvar')&&!button('Salvar').disabled,rows:publicRows(readRows())};
      if(m.type==='JOSE_READ'){checkHeader(m.target);const save=button('Salvar');if(save&&!save.disabled)throw Error('Há alterações não salvas no Portal.');return {ok:true,rows:publicRows(readRows())};}
      if(m.type==='JOSE_VERIFY'){
        checkHeader(m.target);
        const rows=readRows();
        if(button('Salvar')&&!button('Salvar').disabled)throw Error('Há alterações não salvas no Portal.');
        return {ok:rows.length===m.expected.length&&rows.every((b,i)=>b.km===m.expected[i].km&&b.minutes===m.expected[i].minutes&&(m.expected[i].fee===null||b.fee===m.expected[i].fee)),rows:publicRows(rows)};
      }
      return execute(m);
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  };
  window.joseIfoodListener=listener;
  chrome.runtime.onMessage.addListener(listener);
})();
