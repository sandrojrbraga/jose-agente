// Seletores conferidos no Portal em 01/11/2026. Ícones CSS não são texto.
(() => {
  const visible=e=>!!e&&e.getClientRects().length>0;
  const clean=s=>String(s||'').replace(/[\ue000-\uf8ff]/g,'').trim().replace(/\s+/g,' ');
  function header(doc){
    const primary=doc.querySelector('[data-testid="status-indicator-v2"]');
    if(visible(primary))return primary;
    const label=doc.querySelector('[data-testid="restaurant-profile-name"]');
    const parent=label?.closest('button');if(visible(parent))return parent;
    const candidates=Array.from(doc.querySelectorAll('button')).filter(e=>visible(e)&&/^Pizza Pizza(?:\s|-)/.test(clean(e.innerText||e.textContent)));
    return candidates.length===1?candidates[0]:undefined;
  }
  function name(element){
    if(!element)return '';
    const label=element.querySelector('[data-testid="restaurant-profile-name"]');
    return clean(label?(label.innerText||label.textContent):(element.innerText||element.textContent));
  }
  window.JoseIfoodDom={header,name};
})();
