export function diagnosticReport(state,tests,extensionVersion,now=Date.now()){
  const c=state.config,target=c.targets.find(t=>t.id===c.profile.targetId),source=c.sources.find(s=>s.id===target?.sourceId);
  const reading=source?state.status.sources?.[source.id]:null;
  return {...tests,ifood:state.portal||tests.ifood,exportVersion:2,extensionVersion,exportedAt:new Date(now).toISOString(),context:state.context,
    monitor:{enabled:c.enabled,mode:c.mode,profileRole:c.profile.role,schedule:c.schedule,timezone:c.timezone,intervalSeconds:c.intervalSeconds},
    target:target?{id:target.id,name:target.name,enabled:target.enabled,sourceId:target.sourceId,tabId:target.tabId,semanticsConfirmed:target.semanticsConfirmed,timeMode:target.timeMode,volumeMetric:target.volumeMetric,averageDeliveryMinutes:target.averageDeliveryMinutes,adjustStepMinutes:target.adjustStepMinutes,maxMinutes:target.maxMinutes,feeMode:target.feeMode,maxFee:target.maxFee,bands:target.bands,volumeRules:target.volumeRules,feeRules:target.feeRules}:null,
    source:source?{id:source.id,storeId:source.storeId,tabId:source.tabId}:null,
    status:{at:state.status.at,message:state.status.message,error:state.status.error,results:state.status.results?.filter(r=>r.id===target?.id)},
    sourceReading:reading?{capturedAt:reading.capturedAt,count:reading.count,age:reading.age,error:reading.error,stages:reading.stages}:null,
    pending:!!Object.entries(state.states||{}).find(([key,v])=>key.endsWith(':'+target?.id)&&v.pending),
    logs:state.logs.filter(l=>l.storeId===target?.id).slice(0,20)};
}
