import {protocolOf} from './core-metrics.js?v=20261031-player6';
export function scopeData(document,batchId){
  if(batchId==='all')return document;
  const batch=document.batches.find(b=>b.id===batchId);
  if(!batch)throw new Error('测试批次不存在');
  return {...document,meta:{...document.meta,title:batch.title,
    description:'当前范围仅包含此批次的配置、任务与运行。'+(batch.description||'')},
    models:document.models.filter(m=>batch.modelIds.includes(m.id)),
    tasks:document.tasks.filter(t=>batch.taskIds.includes(t.id)),
    batches:[batch],runs:document.runs.filter(r=>r.batchId===batchId)};
}

// Every projection preserves the public document contract, including batch references.
export function projectData(document,{taskIds=null,modelIds=null}={}){
  const tasks=document.tasks.filter(t=>!taskIds||taskIds.includes(t.id));
  const models=document.models.filter(m=>!modelIds||modelIds.includes(m.id));
  const ts=new Set(tasks.map(t=>t.id)),ms=new Set(models.map(m=>m.id));
  return {...document,tasks,models,
    runs:document.runs.filter(r=>ts.has(r.taskId)&&ms.has(r.modelId)),
    batches:document.batches.map(b=>({...b,taskIds:b.taskIds.filter(id=>ts.has(id)),modelIds:b.modelIds.filter(id=>ms.has(id))})).filter(b=>b.taskIds.length&&b.modelIds.length)};
}
export function measurementScope(document,{batchId='all',category='all',taskId='all',protocolId='all'}={}){
  let base=scopeData(document,batchId);
  if(protocolId!=='all'){
    const runProtocol=r=>r.status==='skipped'&&!r.measurement?.protocolId&&!r.provenance?.metricProtocol?(base.meta.protocolId||'legacy-sse-v2'):protocolOf(r);
    const runs=base.runs.filter(r=>runProtocol(r)===protocolId),included=new Set(runs.map(r=>r.taskId)),recorded=new Set(base.runs.map(r=>r.taskId));
    // Measurement and grading are independent protocols. A legacy grader may be
    // used with a new meter; preserve tasks referenced by the selected runs.
    const tasks=base.tasks.filter(t=>included.has(t.id)||(!recorded.has(t.id)&&(base.meta.protocolId||(t.grader.type==='contract'?'core-client-v1':'legacy-sse-v2'))===protocolId));
    base={...base,meta:{...base.meta,protocolId},tasks,runs};
  }
  return projectData(base,{taskIds:base.tasks.filter(t=>(category==='all'||t.category===category)&&(taskId==='all'||t.id===taskId)).map(t=>t.id)});
}
export function comparisonScope(document,modelIds){
  const models=document.models.filter(m=>modelIds.includes(m.id));
  // Intersect attempted tasks, never successful-only tasks: failures remain evidence.
  const common=document.tasks.filter(t=>models.length&&models.every(m=>document.runs.some(r=>r.modelId===m.id&&r.taskId===t.id&&r.status!=='skipped'))).map(t=>t.id);
  return projectData(document,{taskIds:common,modelIds:models.map(m=>m.id)});
}
