// Measurements are grouped by protocol; no legacy/core TPS pooling.
const known=x=>typeof x==='number'&&Number.isFinite(x);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function quantile(xs,p){const a=xs.filter(known).sort((a,b)=>a-b);if(!a.length)return null;const n=(a.length-1)*p,l=Math.floor(n),h=Math.ceil(n);return a[l]+(a[h]-a[l])*(n-l)}
export const protocolOf=r=>r.measurement?.protocolId||r.provenance?.metricProtocol||'legacy-sse-v2';
export const manualTask=t=>t.grader.type==='manual'||(t.grader.type==='contract'&&t.grader.kind==='manual');
const qualification=r=>r.status!=='success'?false:r.grading.assessment?r.grading.assessment.qualified:r.grading.status==='passed'?true:r.grading.status==='failed'?false:null;

export function metricSummary(data,id){
 const tasks=new Map(data.tasks.map(t=>[t.id,t])),runs=data.runs.filter(r=>r.modelId===id&&r.status!=='skipped'),ok=runs.filter(r=>r.status==='success');
 const core=ok.filter(r=>r.measurement?.protocolId==='core-client-v1'),legacy=ok.filter(r=>protocolOf(r)==='legacy-sse-v2');
 const taskMean=(rs,value)=>{
  const byTask=new Map();for(const r of rs){const v=value(r);if(!known(v))continue;if(!byTask.has(r.taskId))byTask.set(r.taskId,[]);byTask.get(r.taskId).push(v)}
  const byFamily=new Map();for(const [taskId,values]of byTask){const family=tasks.get(taskId)?.evaluation?.familyId||taskId;if(!byFamily.has(family))byFamily.set(family,[]);byFamily.get(family).push(mean(values))}
  return {value:mean([...byFamily.values()].map(mean)),tasks:byTask.size,families:byFamily.size};
 };
 const content=taskMean(ok,r=>r.grading.assessment?.contentScore??null);
 const format=taskMean(ok,r=>['passed','failed'].includes(r.grading.assessment?.formatState)?Number(r.grading.assessment.formatState==='passed'):null);
 const constraints=taskMean(ok,r=>{const cs=r.grading.assessment?.constraints;return cs?.length?cs.filter(c=>c.passed).length/cs.length:null});
 const automatic=runs.filter(r=>!manualTask(tasks.get(r.taskId)));
 const delivery=taskMean(automatic,r=>qualification(r)===null?null:Number(qualification(r)));
 const costs=runs.map(r=>r.metrics.cost),unknownCosts=costs.filter(x=>!known(x)).length,totalCost=costs.length&&!unknownCosts?costs.reduce((a,b)=>a+b,0):null;
 const pending=runs.filter(r=>qualification(r)===null).length,qualified=runs.filter(r=>qualification(r)===true).length;
 const costState=!runs.length?'unmeasured':unknownCosts?'unknown_cost':pending?'pending_review':!qualified?'no_qualified':'available';
 const signature=r=>JSON.stringify([r.batchId,r.taskId,protocolOf(r),r.config?.region,r.config?.concurrency,r.config?.temperature,r.config?.reasoning,r.config?.cacheState]);
 const repetitions=new Map();for(const r of runs){if(!Number.isInteger(r.config?.repeatIndex)||r.config.repeatIndex<0)continue;const key=signature(r);if(!repetitions.has(key))repetitions.set(key,new Map());const group=repetitions.get(key),old=group.get(r.config.repeatIndex);if(!old||(r.config.attemptIndex??0)>=(old.config.attemptIndex??0))group.set(r.config.repeatIndex,r)}
 const repeated=[...repetitions.values()].filter(g=>g.size>=2),disagree=repeated.filter(g=>new Set([...g.values()].map(qualification).filter(v=>v!==null)).size>1);
 const signatures=new Set(ok.map(signature));
 const vals=(key,rs=ok)=>rs.map(r=>r.metrics[key]).filter(known),mv=key=>core.map(r=>r.measurement[key]).filter(known),duration=vals('durationMs');
 const tailState=signatures.size>1?'mixed_conditions':duration.length<100?'insufficient_sample':'available';
 return {attempted:runs.length,success:ok.length,errors:runs.length-ok.length,timeouts:runs.filter(r=>r.status==='timeout').length,
  limited:runs.filter(r=>r.error==='http_429').length,truncated:runs.filter(r=>r.error==='output_limit_reached').length,
  completed:runs.length?ok.length/runs.length:null,pending,qualified,qualificationCoverage:runs.length?(runs.length-pending)/runs.length:null,
  content:content.value,contentTasks:content.tasks,contentFamilies:content.families,format:format.value,formatTasks:format.tasks,constraintRate:constraints.value,
  automaticDelivery:delivery.value,automaticTasks:delivery.tasks,automaticFamilies:delivery.families,
  ttft:quantile(vals('ttftMs'),.5),ttfa:quantile(vals('ttfaMs'),.5),duration:quantile(duration,.5),durationSamples:duration.length,
  durationP95:tailState==='available'?quantile(duration,.95):null,tailState,
  bodyTps:quantile(mv('bodyTps'),.5),bodyTpsSamples:mv('bodyTps').length,endToEndTps:quantile(mv('endToEndTps'),.5),endToEndTpsSamples:mv('endToEndTps').length,
  chars:quantile(mv('charsPerSec'),.5),charsSamples:mv('charsPerSec').length,chunkGap:quantile(mv('chunkGapP50Ms'),.5),
  legacyTps:quantile(vals('outputTps',legacy),.5),legacyTpsSamples:vals('outputTps',legacy).length,
  protocols:[...new Set(runs.map(protocolOf))],totalCost,unknownCosts,costState,costPerQualified:costState==='available'?totalCost/qualified:null,
  repeatedGroups:repeated.length,repeatUnits:repeated.reduce((n,g)=>n+g.size,0),disagreeGroups:disagree.length};
}
