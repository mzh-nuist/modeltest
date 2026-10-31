// Import only the public contract. Unknown extension fields never round-trip to exports.
const fields={
 meta:'title description updatedAt kind protocolId suiteId',
 model:'id name family provider endpoint version reasoning contextWindow maxOutputTokens inputPrice outputPrice cachedInputPrice currency sourceUrl sourceDate tags status description priceNote',
 task:'id title category difficulty prompt reference rubric maxOutputTokens source',
 run:'id batchId modelId taskId status dataKind timestamp output error',
 batch:'id title createdAt status dataKind description taskIds modelIds',
 config:'region concurrency temperature reasoning cacheState repeatIndex attemptIndex',
 batchConfig:'region concurrency repeats timeoutSeconds budgetUsd',
 metrics:'ttftMs ttfaMs durationMs outputTps charsPerSec inputTokens outputTokens reasoningTokens cost',
 grading:'status score reason',
 review:'reviewer reviewedAt reason previousStatus decision previousScore',
 provenance:'metricProtocol requestedModel streamUsageMode adapter tokenCountSource timingSource tpsMethod charsMethod costSource usageComplete usageSemantics ratePolicy rateSampleSeconds answerChunkCount',
 grader:'type expected required version kind format',
 evaluation:'suiteId protocolId familyId benchmarkRef reviewState',
 check:'id label path expected points absTolerance relTolerance',
 constraint:'id label type text texts count min max',
 criterion:'id label points passAt zero partial full',
 assessment:'protocolId contentState contentScore formatState qualified',
 decision:'id label passed points earned',
 rubricReview:'reviewer reviewedAt',
 reviewItem:'id awarded reason',
 measurement:'protocolId visibleTokens firstChunkTokens bodyTps endToEndTps charsPerSec chunkGapP50Ms chunkGapP95Ms chunkCount sampleSeconds bodyTpsState'
};
function guard(value,depth=0){
 if(depth>40)throw Error('JSON 嵌套过深');
 if(!value||typeof value!=='object')return;
 for(const [key,v]of Object.entries(value)){
  const k=key.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(['authorization','apikey','xapikey','accesstoken','refreshtoken','password','secret','cookie','cookies','headers','credential','credentials','authtoken','token','proto','constructor','prototype'].includes(k))throw Error('文件包含凭据或不安全字段，请先脱敏');
  guard(v,depth+1);
 }
}
const pick=(x,type)=>Object.fromEntries(fields[type].split(' ').filter(k=>Object.hasOwn(x||{},k)).map(k=>[k,structuredClone(x[k])]));
function grader(x){const g=pick(x,'grader');for(const [key,type]of [['checks','check'],['constraints','constraint'],['criteria','criterion']])if(x&&Object.hasOwn(x,key))g[key]=Array.isArray(x[key])?x[key].map(c=>pick(c,type)):structuredClone(x[key]);return g}
function grading(x){const g=pick(x,'grading');if(Array.isArray(x?.reviews))g.reviews=x.reviews.map(r=>pick(r,'review'));if(x?.assessment){g.assessment=pick(x.assessment,'assessment');for(const key of ['checks','constraints'])g.assessment[key]=Array.isArray(x.assessment[key])?x.assessment[key].map(c=>pick(c,'decision')):null}if(x?.rubricReview){g.rubricReview=pick(x.rubricReview,'rubricReview');g.rubricReview.items=Array.isArray(x.rubricReview.items)?x.rubricReview.items.map(c=>pick(c,'reviewItem')):null}return g}
export function publicData(input){
 guard(input);
 if(!input||typeof input!=='object')throw Error('需要公开结果对象');
 for(const k of ['models','tasks','runs','batches'])if(!Array.isArray(input[k])||input[k].length>50000)throw Error(k+' 必须是数组且不超过 50000 条');
 return {schemaVersion:input.schemaVersion,meta:pick(input.meta,'meta'),
  models:input.models.map(x=>pick(x,'model')),
  tasks:input.tasks.map(x=>({...pick(x,'task'),grader:grader(x.grader),...(x.evaluation?{evaluation:pick(x.evaluation,'evaluation')}:{})})),
  runs:input.runs.map(x=>({...pick(x,'run'),metrics:pick(x.metrics,'metrics'),config:pick(x.config,'config'),provenance:pick(x.provenance,'provenance'),grading:grading(x.grading),...(x.measurement?{measurement:pick(x.measurement,'measurement')}:{})})),
  batches:input.batches.map(x=>({...pick(x,'batch'),config:pick(x.config,'batchConfig')}))};
}
