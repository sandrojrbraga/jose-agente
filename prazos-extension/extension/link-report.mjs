const matchId=(a,b)=>String(a)===String(b);
export function chooseSaipos(readings,source,preferredTabId=null,context='normal'){
  const environment=context==='incognito'?'ANÔNIMO':'NORMAL';
  if(!readings.length)throw Error(`Nenhuma aba Saipos visível no ambiente ${environment}. Abra Saipos nesta mesma janela, faça login e entre no Kanban. Uma aba aberta em outro ambiente não pode ser vinculada.`);
  if(Number.isInteger(preferredTabId)){
    const selected=readings.find(r=>r.tabId===preferredTabId);
    if(!selected){const recovered=readings.filter(r=>r.complete&&!r.error&&matchId(r.storeId,source.storeId));if(recovered.length===1)return recovered[0];throw Error(`A aba Saipos escolhida (${preferredTabId}) não está disponível no ambiente ${environment}. Atualize as abas e escolha novamente em Cadastro.`);}
    if(selected.error||!selected.complete)throw Error(`Saipos · aba ${selected.tabId}: ${selected.error||'Leitura incompleta.'}`);
    if(!matchId(selected.storeId,source.storeId))throw Error(`Saipos da aba ${selected.tabId}: ID ${selected.storeId||'não identificado'}; esperado ${source.storeId}. Escolha a cozinha correta em Cadastro.`);
    return selected;
  }
  const matches=readings.filter(r=>r.complete&&!r.error&&matchId(r.storeId,source.storeId));
  if(matches.length===1)return matches[0];
  if(matches.length>1)throw Error(`Há ${matches.length} abas Saipos da cozinha ${source.storeId} (abas ${matches.map(r=>r.tabId).join(', ')}). Escolha uma em Cadastro → Aba do Kanban e tente vincular novamente.`);
  const errors=readings.filter(r=>r.error||!r.complete);
  if(errors.length)throw Error(`Não foi possível ler o Saipos ${source.storeId}. ${errors.map(r=>`Aba ${r.tabId}: ${r.error||'leitura incompleta'}`).join(' | ')}`);
  throw Error(`Cozinha Saipos diferente: esperado ID ${source.storeId}; lidos ${readings.map(r=>`${r.storeId||'não identificado'} na aba ${r.tabId}`).join(', ')}. Confira o login e a cozinha em Cadastro.`);
}
export const linkReadings=readings=>readings.map(({tabId,storeId,count,complete,error,readerVersion})=>({tabId,storeId,count,complete,error,readerVersion}));
