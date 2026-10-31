const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const fail=s=>{throw Error(s)};
const string=(x,label)=>{if(typeof x!=='string'||x.length>500000)fail(label+' 必须是字符串')};
export function validateContract(g){
 if(g.version!=='core-rubric-v1'||!['number','json','text_rules','manual'].includes(g.kind)||!['number_only','json_only','plain_text'].includes(g.format))fail('未知评分契约');
 if(g.format!==({number:'number_only',json:'json_only',text_rules:'plain_text',manual:'plain_text'})[g.kind])fail('输出格式与评分类型矛盾');
 const lists=['checks','constraints','criteria'];for(const key of lists){const a=Object.hasOwn(g,key)?g[key]:[];if(!Array.isArray(a)||a.length>100)fail('评分项必须是有界数组');const ids=new Set();for(const c of a){if(!c||typeof c!=='object'||typeof c.id!=='string'||!c.id||ids.has(c.id))fail('评分项ID重复或无效');ids.add(c.id);if(c.label!=null)string(c.label,'评分项说明')}}
 if(['number','json'].includes(g.kind)&&!g.checks?.length)fail('缺少内容检查项');
 if(g.kind==='text_rules'&&!g.constraints?.length)fail('缺少可验证约束');if(g.kind==='manual'&&!g.criteria?.length)fail('人工题缺少细项标准');
 if(['manual','text_rules'].includes(g.kind)&&g.checks?.length||g.kind!=='manual'&&g.criteria?.length)fail('评分项与题型矛盾');
 for(const c of g.checks??[]){const path=Object.hasOwn(c,'path')?c.path:[];if(!Object.hasOwn(c,'expected')||!finite(c.points)||c.points<=0||!Array.isArray(path)||path.some(x=>typeof x!=='string'&&(!Number.isInteger(x)||x<0)))fail('内容检查格式错误');for(const k of ['absTolerance','relTolerance'])if(Object.hasOwn(c,k)&&!finite(c[k]))fail('容差错误')}
 for(const c of g.constraints??[]){if(!['contains','forbidden','paragraphs','hanzi','lines','occurrences','one_per_line'].includes(c.type))fail('未知约束类型');if(['contains','forbidden','occurrences'].includes(c.type)&&(typeof c.text!=='string'||!c.text))fail('缺少约束文本');if(c.type==='occurrences'&&(!Number.isInteger(c.count)||c.count<0))fail('次数约束错误');if(['paragraphs','hanzi','lines'].includes(c.type)&&(!Number.isInteger(c.min)||!Number.isInteger(c.max)||c.min<0||c.max<c.min))fail('长度约束错误');if(c.type==='one_per_line'&&(!Array.isArray(c.texts)||!c.texts.length||c.texts.length>100||c.texts.some(x=>typeof x!=='string'||!x.trim())||new Set(c.texts).size!==c.texts.length))fail('逐行约束需要1至100个唯一且非空的文本')}
 for(const c of g.criteria??[]){for(const k of ['label','zero','partial','full']){string(c[k],'人工锚点');if(!c[k].trim())fail('人工锚点不能为空')}if(!finite(c.points)||c.points<=0||!finite(c.passAt)||c.passAt>c.points)fail('人工评分权重错误')}
 const jsonValue=x=>{if(x===null||typeof x==='string'||typeof x==='boolean')return;if(typeof x==='number'){if(!Number.isFinite(x))fail('标准答案包含非有限数值');return}if(Array.isArray(x)){x.forEach(jsonValue);return}if(x&&typeof x==='object'){Object.values(x).forEach(jsonValue);return}fail('标准答案不是JSON值')};
 for(const c of g.checks??[])jsonValue(c.expected);
 if(g.kind==='number')for(const c of g.checks){
  if(!['number','string'].includes(typeof c.expected)||(c.path??[]).length)fail('数值检查必须使用根数值答案');
  if(typeof c.expected==='string'){
   const value=c.expected.trim(),digits='[0-9](?:_?[0-9])*',decimal=new RegExp('^[+-]?(?:'+digits+'(?:\\.(?:'+digits+')?)?|\\.'+digits+')(?:[eE][+-]?'+digits+')?$'),fraction=new RegExp('^([+-]?'+digits+')\\s*/\\s*('+digits+')$');
   const parts=value.match(fraction);if(!decimal.test(value)&&(!parts||!/[1-9]/.test(parts[2])))fail('数值标准答案无效');
  }
 }
 if((g.constraints??[]).some(c=>c.id==='output-shape'))fail('output-shape 是保留约束ID');
}

function validateMeasurement(r){
 const m=r.measurement;if(!m)return;
 if(m.protocolId!=='core-client-v1')fail('未知测量协议');
 if(!finite(r.metrics.durationMs))fail('测量记录需要完整请求耗时');
 const keys=['visibleTokens','firstChunkTokens','bodyTps','endToEndTps','charsPerSec','chunkGapP50Ms','chunkGapP95Ms','chunkCount','sampleSeconds'];
 for(const k of keys)if(!Object.hasOwn(m,k)||(m[k]!==null&&!finite(m[k])))fail('测量字段缺失或无效：'+k);
 for(const k of ['visibleTokens','firstChunkTokens','chunkCount'])if(m[k]!==null&&!Number.isInteger(m[k]))fail('测量计数必须为整数');
 if(m.chunkCount===null)fail('分块数量不能为空');
 if(!['measured','request_incomplete','unknown_tokens','unknown_first_chunk','insufficient_sample'].includes(m.bodyTpsState))fail('未知速率可用状态');
 if(m.firstChunkTokens!==null&&(m.visibleTokens===null||m.firstChunkTokens>m.visibleTokens))fail('首块计数超过正文总量');
 if(m.firstChunkTokens!==null&&m.chunkCount===0)fail('首块计数缺少可见分块');
 if(r.status!=='success'&&['bodyTps','endToEndTps','charsPerSec','chunkGapP50Ms','chunkGapP95Ms'].some(k=>m[k]!==null))fail('失败请求不能展示成功速率');
 if(m.sampleSeconds!==null&&(r.metrics.durationMs==null||m.sampleSeconds>r.metrics.durationMs/1000+.001))fail('采样区间超过请求耗时');
 if((m.chunkCount<2)!==(m.sampleSeconds===null))fail('采样区间与分块数量矛盾');
 const enough=r.status==='success'&&m.chunkCount>=3&&m.sampleSeconds!==null&&m.sampleSeconds>=.5;
 const state=r.status!=='success'?'request_incomplete':m.visibleTokens===null?'unknown_tokens':m.firstChunkTokens===null?'unknown_first_chunk':!enough||m.visibleTokens-m.firstChunkTokens<64?'insufficient_sample':'measured';
 if(m.bodyTpsState!==state)fail('速率可用状态与测量证据矛盾');
 if(m.bodyTpsState==='measured'){
  if(r.status!=='success'||m.visibleTokens===null||m.firstChunkTokens===null||m.visibleTokens-m.firstChunkTokens<64||m.chunkCount<3||m.sampleSeconds===null||m.sampleSeconds<.5||m.bodyTps===null)fail('TPS没有足够计数或时间证据');
  const expected=(m.visibleTokens-m.firstChunkTokens)/m.sampleSeconds;if(Math.abs(m.bodyTps-expected)>Math.max(.01,expected*1e-4))fail('TPS与采样证据不一致');
 }else if(m.bodyTps!==null)fail('不可用速率必须留空');
 if(m.endToEndTps!==null){if(!r.metrics.durationMs||m.visibleTokens===null)fail('端到端速率缺用量或时间');const x=m.visibleTokens/(r.metrics.durationMs/1000);if(Math.abs(m.endToEndTps-x)>Math.max(.01,x*.001))fail('端到端速率矛盾')}
 if(r.status==='success'&&m.visibleTokens!==null&&r.metrics.durationMs>0&&m.endToEndTps===null)fail('已知用量和耗时不能隐藏端到端速率');
 if(m.charsPerSec!==null&&(!enough||m.charsPerSec*m.sampleSeconds<63.999||m.charsPerSec*m.sampleSeconds>[...r.output].length+.01))fail('字符速率缺少足够文本或采样证据');
 for(const k of ['chunkGapP50Ms','chunkGapP95Ms'])if((m[k]!==null)!==(r.status==='success'&&m.chunkCount>=2)||(m[k]!==null&&(m.sampleSeconds===null||m[k]>m.sampleSeconds*1000+.01)))fail('分块间隔与采样证据矛盾');
 if(m.chunkGapP50Ms!==null&&m.chunkGapP95Ms!==null&&m.chunkGapP50Ms>m.chunkGapP95Ms)fail('分块P50不能大于P95');
 const semantics=r.provenance?.usageSemantics,output=r.metrics.outputTokens,reasoning=r.metrics.reasoningTokens;
 if(!['visible_only','includes_reasoning'].includes(semantics))fail('新测量缺少明确用量语义');
 const visible=semantics==='visible_only'?output:semantics==='includes_reasoning'&&output!=null&&reasoning!=null?output-reasoning:null;
 if(m.visibleTokens!==(visible??null))fail('可见token计数与声明的用量语义矛盾');
 if(r.metrics.outputTps!==m.bodyTps||r.metrics.charsPerSec!==m.charsPerSec)fail('新协议速率镜像不一致');
}

function sameIds(items,expected,label){
 if(items.length!==expected.length||new Set(items.map(c=>c.id)).size!==items.length||items.some(c=>!expected.some(x=>x.id===c.id)))fail(label+'与评分契约不一致');
}

function validateAssessment(r,t){
 const g=r.grading,a=g.assessment,spec=t.grader;
 if(!a||a.protocolId!=='core-rubric-v1'||!['passed','failed','pending','not_applicable'].includes(a.contentState)||!['passed','failed','not_applicable'].includes(a.formatState))fail('缺少分离评分结果');
 if(a.contentScore!==null&&(!finite(a.contentScore)||a.contentScore>1))fail('内容分越界');
 if(a.qualified!==null&&typeof a.qualified!=='boolean')fail('合格状态错误');
 for(const k of ['checks','constraints'])if(!Array.isArray(a[k])||a[k].some(c=>!c||typeof c.id!=='string'||typeof c.label!=='string'||typeof c.passed!=='boolean'))fail('逐项评分错误');
 if(r.status!=='success'){
  if(g.rubricReview||a.qualified!==false||a.contentState!=='not_applicable'||a.formatState!=='not_applicable'||a.contentScore!==null||a.checks.length||a.constraints.length)fail('失败请求不能完成质量评分');
  return;
 }
 sameIds(a.constraints,[{id:'output-shape'},...(spec.constraints??[])],'约束细项');
 const format=a.constraints.every(c=>c.passed);
 if(a.formatState!==(format?'passed':'failed'))fail('格式分与约束结果矛盾');
 if(spec.kind==='manual'&&g.status==='pending'){
  if(g.rubricReview||a.contentState!=='pending'||a.contentScore!==null||a.qualified!==null||a.checks.length||g.score!==null)fail('人工待评状态矛盾');
  return;
 }
 const expected=spec.kind==='manual'?spec.criteria:(spec.checks??[]);
 sameIds(a.checks,expected,'内容细项');
 let reviewItems=null;
 if(spec.kind==='manual'){
  const review=g.rubricReview;
  if(!review||typeof review.reviewer!=='string'||!review.reviewer.trim()||typeof review.reviewedAt!=='string'||!review.reviewedAt.trim()||!Array.isArray(review.items))fail('人工评分缺完整评审');
  sameIds(review.items,spec.criteria,'人工评审细项');
  reviewItems=new Map(review.items.map(c=>[c.id,c]));
 }else if(g.rubricReview)fail('自动题不能附加人工锚点评分');
 for(const c of a.checks){
  const ref=expected.find(x=>x.id===c.id);
  if(c.points!==ref.points||!finite(c.earned)||c.earned>c.points)fail('内容细项权重或得分矛盾');
  if(reviewItems){
   const item=reviewItems.get(c.id);
   if(![0,ref.points/2,ref.points].includes(item.awarded)||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>4000||c.earned!==item.awarded||c.passed!==(item.awarded>=ref.passAt))fail('人工评分锚点或逐项证据矛盾');
  }else if(c.earned!==(c.passed?ref.points:0))fail('自动细项必须按检查结果计分');
 }
 const score=a.checks.length?a.checks.reduce((n,c)=>n+c.earned,0)/a.checks.reduce((n,c)=>n+c.points,0):null;
 if(score===null?a.contentScore!==null:a.contentScore===null||Math.abs(score-a.contentScore)>1e-9)fail('内容分与逐项得分矛盾');
 const contentState=a.checks.length?(a.checks.every(c=>c.passed)?'passed':'failed'):'not_applicable';
 if(a.contentState!==contentState)fail('内容状态与逐项检查矛盾');
 const qualified=format&&['passed','not_applicable'].includes(contentState);
 if(a.qualified!==qualified||g.status!==(qualified?'passed':'failed')||g.score!==(score??Number(format)))fail('总状态或总分与内容和约束矛盾');
}

export function validateProtocols(d){
 if(d.meta.protocolId!=null&&!['core-client-v1','legacy-sse-v2'].includes(d.meta.protocolId))fail('数据集测量协议未知');
 const tasks=new Map(d.tasks.map(t=>[t.id,t]));
 for(const t of d.tasks){if(t.grader.type==='contract')validateContract(t.grader);if(t.evaluation){for(const k of ['suiteId','protocolId','familyId','benchmarkRef','reviewState'])string(t.evaluation[k],'任务评测元数据');if(t.grader.type==='contract'&&t.evaluation.protocolId!==t.grader.version)fail('题目元数据与评分协议矛盾')}}
 for(const r of d.runs){
  validateMeasurement(r);const g=r.grading,a=g.assessment,t=tasks.get(r.taskId);
  const protocol=r.measurement?.protocolId||r.provenance?.metricProtocol||(r.status==='skipped'?d.meta.protocolId:null)||'legacy-sse-v2';
  if(r.provenance?.metricProtocol!=null&&!['core-client-v1','legacy-sse-v2'].includes(r.provenance.metricProtocol))fail('运行测量协议未知');
  if(r.measurement&&r.provenance?.metricProtocol!==r.measurement.protocolId||r.provenance?.metricProtocol==='core-client-v1'&&!r.measurement&&r.status!=='skipped')fail('运行协议与测量记录矛盾');
  if(d.meta.protocolId!=null&&d.meta.protocolId!==protocol)fail('运行协议与数据集声明矛盾');
  if(r.provenance?.streamUsageMode!=null&&r.provenance.streamUsageMode!=='cumulative_visible_fixture')fail('未知流式计数器');
  if(r.provenance?.streamUsageMode==='cumulative_visible_fixture'&&r.dataKind!=='demo')fail('玩具计数器不能冒充实测');
  if(r.measurement?.firstChunkTokens!=null&&r.provenance?.streamUsageMode!=='cumulative_visible_fixture')fail('首块token缺少受支持的累计计数来源');
  if(t.grader.type!=='contract'){if(a)fail('旧题不能冒称新评分协议');continue}
  validateAssessment(r,t);
 }
 return d;
}
