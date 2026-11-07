(() => {
  if(window.joseSaiposReaderVersion===2)return;
  if(window.joseSaiposListener)chrome.runtime.onMessage.removeListener(window.joseSaiposListener);
  const listener=(m,s,reply)=>{
    if(s.id!==chrome.runtime.id||m.type!=='SAIPOS_READ')return;
    try{reply(window.JoseSaiposReader.read(document,location));}
    catch(e){reply({readerVersion:2,error:e.message,complete:false,capturedAt:Date.now()});}
  };
  window.joseSaiposListener=listener;window.joseSaiposReaderVersion=2;
  chrome.runtime.onMessage.addListener(listener);
})();
