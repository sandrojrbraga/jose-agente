import {demand} from './core.mjs';
export const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function auditSaipos(snapshot,source,config,now=Date.now()){
  if(snapshot?.error)throw Error(snapshot.error);
  if(snapshot?.storeId!==source.storeId)throw Error(`ID diferente: esperado ${source.storeId}, recebido ${snapshot?.storeId||'não identificado'}.`);
  const productionMinutes=demand(snapshot,config,now);
  return {ok:true,readAt:snapshot.capturedAt,storeId:snapshot.storeId,productionMinutes,count:snapshot.count,stages:snapshot.stages||[],readerVersion:snapshot.readerVersion};
}
export function auditIfood(snapshot,target,sourceTest,config,now=Date.now()){
  if(snapshot?.error)throw Error(snapshot.error);
  if(!snapshot?.deliveryPage)throw Error('Abra a tela Configurações de entrega no perfil desta loja.');
  if(norm(snapshot.name)!==norm(target.name))throw Error(`Loja diferente: esperada ${target.name}; tela mostra ${snapshot.name||'não identificada'}. Nenhuma troca foi realizada.`);
  if(snapshot.unsaved)throw Error('Há alterações não salvas na tela. Confira ou cancele manualmente antes do teste.');
  if(!snapshot.rows?.length)throw Error('Nenhuma faixa foi lida.');
  let last=0;
  for(const r of snapshot.rows){
    if(!Number.isFinite(r.km)||r.km<=last||!Number.isInteger(r.minutes)||r.minutes<1||r.minutes>1440||!Number.isFinite(r.fee)||r.fee<0)throw Error('Tabela contém raio, prazo ou taxa inválida.');
    last=r.km;
  }
  let productionMinutes=null;
  const source=config.sources.find(s=>s.id===target.sourceId);
  if(sourceTest?.ok&&source&&sourceTest.storeId===source.storeId&&now-sourceTest.readAt<=config.staleSeconds*1000)productionMinutes=sourceTest.productionMinutes;
  return {ok:true,readAt:snapshot.capturedAt,name:snapshot.name,configuredStoreId:target.id,
    selectedIdVerified:false,identityNote:'Nome conferido. O ID selecionado não é exibido no cabeçalho; o ID acima é o cadastro esperado, não uma leitura direta do Portal.',
    productionMinutes,rows:snapshot.rows.map(r=>{
      const base=target.bands.find(b=>b.km===r.km);
      const proposed=base&&productionMinutes!==null?base.minutes+productionMinutes:null;
      return {...r,baseMinutes:base?.minutes??null,proposedMinutes:proposed,difference:proposed===null?null:r.minutes-proposed};
    }),note:'Comparação com parâmetros salvos. Divergência não prova erro: confirme a tabela-base e o significado do campo Tempo. Nenhum valor foi alterado.'};
}
