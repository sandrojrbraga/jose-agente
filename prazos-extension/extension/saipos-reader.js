// Leitor somente de DOM, sem cookies, estado Angular ou API interna.
(() => { window.JoseSaiposReader={read:(document,location,capturedAt=Date.now())=>{
    if(!location.hash.includes('/kanban')) throw Error('Abra o Kanban Saipos.');
    const header=document.querySelector('[name="current-store-name-header-button"]');
    const tip=header?.getAttribute('uib-tooltip')||document.querySelector('[name="current-store-name-header-button"] [uib-tooltip]')?.getAttribute('uib-tooltip');
    const storeId=tip?.match(/\[(\d+)\]/)?.[1];
    if(!storeId) throw Error('Não foi possível identificar o ID Saipos.');
    for(const name of ['searchNumber','searchDesc','searchPhone','searchAddress','searchNumberPartner']) {
      if(document.querySelector(`input[name="${name}"]`)?.value.trim()) throw Error('Limpe os filtros de busca do Kanban.');
    }
    function fulfillment(card){
      // Condições de elementos efetivamente renderizados; não acessa o estado Angular.
      const nodes=card.querySelectorAll?[...card.querySelectorAll('[ng-if]')]:[];
      const types=new Set(nodes.map(e=>e.getAttribute('ng-if')?.match(/^sale\.id_sale_type\s*==\s*(\d+)$/)?.[1]).filter(Boolean));
      const lines=card.innerText.split('\n').map(x=>x.trim());
      if(lines.some(x=>/^(consumo interno|consumo no local|mesa(?:\s+\d+)?)$/i.test(x)))return 'internal';
      if(types.has('2')||lines.some(x=>/^(balcão|balcao|retirada|retirar na loja)$/i.test(x)))return 'pickup';
      if(types.size===1&&types.has('1'))return 'delivery';
      return 'unknown';
    }
    function column(stage){
      const h=[...document.querySelectorAll('h3')].find(e=>e.innerText.trim()===stage);
      if(!h)throw Error('Coluna ausente: '+stage);
      const root=h.parentElement,count=Number(root.querySelector('.count-sale')?.innerText.trim());
      if(!Number.isInteger(count)||count<0)throw Error('Contador inválido: '+stage);
      const elements=[...root.querySelectorAll('li.kanban-sale')];
      if(elements.length!==count)throw Error('Leitura parcial: cartões e contador não conferem em '+stage);
      const seen=new Set();
      const cards=elements.map(e=>{
        const checkbox=e.querySelector('input[type="checkbox"]'),id=checkbox?.id||checkbox?.getAttribute('data-qa');
        if(!id||seen.has(id))throw Error('Cartão sem identificador único ou duplicado.');seen.add(id);
        const text=e.innerText;
        return {id,fulfillment:fulfillment(e),created:text.match(/\d{1,2}\/\w{3},?\s*\d{2}:\d{2}/)?.[0],since:text.match(/Desde\s+\d{2}:\d{2}[^\n]*/)?.[0]};
      });return {count,cards,complete:true};
    }
    const {count,cards}=column('Cozinha');
    let waiting;try{waiting=column('Aguardando entrega');if(waiting.cards.some(w=>cards.some(k=>k.id===w.id)))throw Error('Mesmo pedido em duas etapas.');}catch(e){waiting={complete:false,error:e.message};}
    const stages=['Cozinha','Aguardando entrega','Saiu para entrega'].map(stage=>{
      const heading=[...document.querySelectorAll('h3')].find(e=>e.innerText.trim()===stage);
      if(!heading) throw Error('Coluna ausente: '+stage);
      const value=Number(heading.parentElement.querySelector('.count-sale')?.innerText.trim());
      if(!Number.isInteger(value)||value<0) throw Error('Contador inválido: '+stage);
      return {stage,count:value};
    });
    return {storeId,readerVersion:5,capturedAt,complete:true,count,cards,stages,waiting};
}};})();
