(() => {
  if(window.joseSaiposListener){try{chrome.runtime.onMessage.removeListener(window.joseSaiposListener);}catch{}}
  const listener=(m,s,reply)=>{
    if(s.id!==chrome.runtime.id||m.type!=='SAIPOS_READ')return;
    try{reply(window.JoseSaiposReader.read(document,location));}
    catch(e){reply({readerVersion:6,error:e.message,complete:false,capturedAt:Date.now()});}
  };
  window.joseSaiposListener=listener;window.joseSaiposReaderVersion=6;
  chrome.runtime.onMessage.addListener(listener);
})();
