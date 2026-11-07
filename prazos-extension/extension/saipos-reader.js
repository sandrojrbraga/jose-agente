// Leitor somente de DOM, sem cookies, estado Angular ou API interna.
(() => { window.JoseSaiposReader={read:(document,location,capturedAt=Date.now())=>{
    if(!location.hash.includes('/kanban')) throw Error('Abra o Kanban Saipos.');
    const tip=document.querySelector('[name="current-store-name-header-button"] [uib-tooltip]')?.getAttribute('uib-tooltip');
    const storeId=tip?.match(/\[(\d+)\]/)?.[1];
    if(!storeId) throw Error('Não foi possível identificar o ID Saipos.');
    for(const name of ['searchNumber','searchDesc','searchPhone','searchAddress','searchNumberPartner']) {
      if(document.querySelector(`input[name="${name}"]`)?.value.trim()) throw Error('Limpe os filtros de busca do Kanban.');
    }
    const h=[...document.querySelectorAll('h3')].find(e=>e.innerText.trim()==='Cozinha');
    if(!h) throw Error('Coluna Cozinha não encontrada.');
    const root=h.parentElement, count=Number(root.querySelector('.count-sale')?.innerText.trim());
    if(!Number.isInteger(count)||count<0) throw Error('Contador de produção inválido.');
    const elements=[...root.querySelectorAll('li.kanban-sale')];
    if(elements.length!==count) throw Error('Leitura parcial: cartões e contador não conferem.');
    const seen=new Set();
    const cards=elements.map(e=>{
      const checkbox=e.querySelector('input[type="checkbox"]');
      const id=checkbox?.id||checkbox?.getAttribute('data-qa');
      if(!id||seen.has(id)) throw Error('Cartão sem identificador único ou duplicado.');
      seen.add(id);
      const text=e.innerText;
      return {id,created:text.match(/\d{1,2}\/\w{3},?\s*\d{2}:\d{2}/)?.[0],since:text.match(/Desde\s+\d{2}:\d{2}[^\n]*/)?.[0]};
    });
    const stages=['Cozinha','Aguardando entrega','Saiu para entrega'].map(stage=>{
      const heading=[...document.querySelectorAll('h3')].find(e=>e.innerText.trim()===stage);
      if(!heading) throw Error('Coluna ausente: '+stage);
      const value=Number(heading.parentElement.querySelector('.count-sale')?.innerText.trim());
      if(!Number.isInteger(value)||value<0) throw Error('Contador inválido: '+stage);
      return {stage,count:value};
    });
    return {storeId,readerVersion:2,capturedAt,complete:true,count,cards,stages};
}};})();
