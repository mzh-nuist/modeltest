import {validateCheckupReport,previewableCheckupSVG} from './checkup-data.js?v=20261031-player6';
import {extractDrawing} from './completed-suite.js?v=20261031-player6';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateHighSuite(suite,legacy,bank,limits){
 const fail=()=>{throw Error('high单档成绩与协议不一致');};
 if(suite?.schemaVersion!=='daily-high-v1'||suite.suiteId!==legacy.suiteId||suite.scoreVersion!=='high-only-100-v1'||suite.origin!=='publisher-local-high-only-collection'||suite.effort!=='high'||suite.timeoutSeconds!==null||suite.automaticRetries!==0||!['service-declared-maximum','per-model-recorded'].includes(suite.outputPolicy)||JSON.stringify(suite.tasks)!==JSON.stringify(legacy.tasks)||suite.models?.length!==5||!Number.isFinite(Date.parse(suite.updatedAt))||!/^https:\/\/commandcode\.ai\//.test(suite.limitSource)||!/^[a-f0-9]{64}$/.test(suite.limitSourceDigest))fail();
 if(!limits||limits.source!==suite.limitSource||limits.sourceDigest!==suite.limitSourceDigest||limits.models?.length!==5)fail();
 let calls=0,success=0;
 suite.models.forEach((m,j)=>{
  if(m.modelId!==limits.models[j].modelId||m.maxOutputTokens!==limits.models[j].maxOutputTokens||m.limitStatus!==limits.models[j].limitStatus)fail();
  if(m.limitSource!==limits.models[j].limitSource||m.limitSourceDigest!==limits.models[j].limitSourceDigest||m.limitAuthority!==limits.models[j].limitAuthority||!/^https:\/\//.test(m.limitSource)||!/^[a-f0-9]{64}$/.test(m.limitSourceDigest)||!['service','model-publisher'].includes(m.limitAuthority))fail();
  if(m.modelId!==legacy.models[j].modelId||m.effort!=='high'||m.provider!=='CommandCode'||!['declared','unverified'].includes(m.limitStatus)||m.items?.length!==8||!/^[a-f0-9]{64}$/.test(m.sourceDigest)||m.limitStatus==='unverified'&&(m.maxOutputTokens!==null||m.requests!==0)||m.limitStatus==='declared'&&(!Number.isInteger(m.maxOutputTokens)||m.maxOutputTokens<1))fail();
  const policy=m.outputPolicy||'service-declared-maximum',bounded=policy==='budget-bounded-output';
  if(!['service-declared-maximum','budget-bounded-output'].includes(policy)||bounded&&(!['kimi-k31-pro','kimi-k3'].includes(m.modelId)||suite.outputPolicy!=='per-model-recorded'))fail();
  let n=0,ok=0;
  m.items.forEach((x,i)=>{
   const t=suite.tasks[i],a=x.measurement;if(x.taskId!==t.id||typeof x.reason!=='string'||x.score!==null&&(!Number.isFinite(x.score)||x.score<0||x.score>2)||i<6&&x.score!==null&&![0,1,2].includes(x.score)||i===6&&x.score!==null&&![0,2].includes(x.score))fail();
   if(!a){if(x.score!==null)fail();return;}
   if(a.effort!=='high'||a.apiModel!==m.apiModel||a.maxOutputTokens!==m.maxOutputTokens||a.timeoutSeconds!==null||typeof a.output!=='string'||a.outputs?.length!==t.prompts.length||!Array.isArray(a.attempts)||a.attempts.length>t.prompts.length||!/^[a-f0-9]{64}$/.test(a.sourceDigest)||!['success','error','timeout','incomplete','not_run'].includes(a.status)||a.output!==(a.outputs.at(-1)||''))fail();
   if((a.outputPolicy||'service-declared-maximum')!==policy)fail();
   a.attempts.forEach((at,k)=>{const cap=at.maxOutputTokens??(bounded?null:m.maxOutputTokens);if(at.step!==k+1||!['success','error','timeout'].includes(at.status)||!Number.isInteger(cap)||cap<1||cap>m.maxOutputTokens||!bounded&&cap!==m.maxOutputTokens||bounded&&cap<8192||at.tokenUsage?.outputTokens>cap)fail();n++;ok+=at.status==='success';});
   const at=a.attempts[0],ownerAccepted=i===0&&x.reviewer==='site-owner'&&x.adjudication==='owner-accepted-content-missing-finish'&&a.status==='error'&&a.error==='invalid_or_incomplete_stream'&&a.attempts.length===1&&at.status==='error'&&at.error==='invalid_or_incomplete_stream'&&at.httpStatus===200&&at.streamDone===true&&at.finishSeen===false&&Number.isInteger(at.tokenUsage?.inputTokens)&&Number.isInteger(at.tokenUsage?.outputTokens)&&at.tokenUsage.outputTokens<at.maxOutputTokens&&a.output.trim().length>0;
   if(x.adjudication!==undefined&&!ownerAccepted)fail();
   if(x.score!==null&&(!a.attempts.length||a.status!=='success'&&x.score!==0&&!ownerAccepted))fail();
   if(a.status==='success'&&(a.outputs.some(o=>!o)||a.attempts.length!==t.prompts.length||a.attempts.some(at=>at.status!=='success')))fail();
   if(i===2&&x.score===2&&a.output.trim()!==bank.tasks[2].exactAnswer.trim())fail();
   if(i===6&&a.imageSha256!==t.imageSha256)fail();
   if((i===5||i===7)&&x.score>0&&!previewableCheckupSVG(extractDrawing(a.output).svg))fail();
   if(i===7&&x.score!==null){const valid=a.status==='success'&&previewableCheckupSVG(extractDrawing(a.output).svg);if(!valid){if(x.score!==0||x.criteriaScores?.length)fail();}else if(x.criteriaScores?.length!==4||x.criteriaScores.some((c,k)=>!Number.isInteger(c.awarded)||c.awarded<0||c.awarded>t.criteria[k].max)||Math.abs(x.criteriaScores.reduce((v,c)=>v+c.awarded,0)-x.score*7.5)>1e-7)fail();}
  });
  if(m.requests!==n||m.successfulRequests!==ok||m.maxOutputTokens===null&&m.items.some(x=>x.score!==null||x.measurement?.attempts.length))fail();calls+=n;success+=ok;
 });
 if(suite.totalRequests!==calls||suite.successfulRequests!==success)fail();return suite;
}
export function projectHighSuite(suite,legacyData,legacy,bank){
 const rows=[],models=[];
 suite.models.forEach((m,i)=>{
  const actualOutputCaps=[...new Set(m.items.flatMap(x=>(x.measurement?.attempts||[]).map(a=>a.maxOutputTokens??m.maxOutputTokens)))];
  const report={schemaVersion:'daily-checkup-report-v1',suiteId:bank.suiteId,kind:'imported',modelLabel:m.name,checkedAt:m.checkedAt,conditions:`high；无总时长限制；文档最大输出${m.maxOutputTokens??'未核实'}；${m.outputPolicy==='budget-bounded-output'?'预算内实际输出额度 '+(actualOutputCaps.length?Math.min(...actualOutputCaps)+'—'+Math.max(...actualOutputCaps):'未发送'):'按文档最大值请求'}。`,runs:bank.tasks.map((t,j)=>{const a=m.items[j].measurement;return {taskId:t.id,status:!a?.attempts.length?'not_run':a.status==='success'?'complete':'incomplete',outputs:a?.outputs||t.prompts.map(()=>null),review:null,note:!a?.attempts.length?m.items[j].reason:a.status==='success'?'':a.error||'本次未完整交付。'};})};
  validateCheckupReport(report,bank);const complete=m.items.every(x=>x.score!==null);
  rows.push({modelId:m.modelId,sourceDigest:m.sourceDigest,items:m.items,selectionFinal:complete});
  models.push({...legacyData.models[i],apiModel:m.apiModel,name:m.name,provider:m.provider,checkedAt:m.checkedAt,report,sourceDigest:m.sourceDigest,selectedEffort:'high',highOnly:true,outputLimit:m.maxOutputTokens,limitNote:m.limitNote,outputLimitSource:m.limitSource,outputLimitAuthority:m.limitAuthority,outputPolicy:m.outputPolicy||'service-declared-maximum',actualOutputCaps,deliveryIssues:m.items.filter(x=>x.measurement?.attempts.some(a=>a.status!=='success')).length,
   checks:m.items.slice(0,6).map((x,j)=>({taskId:x.taskId,label:x.adjudication==='owner-accepted-content-missing-finish'&&x.score===2?'站长判定通过':report.runs[j].status!=='complete'?'未完成':x.score===2?'主要内容通过':'需要复核',note:x.reason,origin:x.reviewer==='site-owner'?'site-owner':j===2?'rule':'assistant'}))});
 });
 return {data:{...legacyData,models,highOnly:true,totalRequests:suite.totalRequests,successfulRequests:suite.successfulRequests,publishedAt:suite.updatedAt},book:{...legacy,schemaVersion:'daily-weighted-v5',scoreVersion:suite.scoreVersion,condition:'high-only-no-deadline',updatedAt:suite.updatedAt,models:rows,highOnly:true,highSource:suite}};
}
export function highPanel(book,id){
 if(!book?.highOnly)return '';const m=book.highSource.models.find(x=>x.modelId===id),bounded=m.outputPolicy==='budget-bounded-output',budgetBlocked=m.items.some(x=>x.measurement?.error==='original_twenty_percent_budget_exhausted'),caps=m.items.flatMap(x=>(x.measurement?.attempts||[]).map(a=>a.maxOutputTokens??m.maxOutputTokens));
 const attempts=m.items.flatMap(x=>x.measurement?.attempts||[]),known=attempts.filter(a=>Number.isInteger(a.tokenUsage?.outputTokens)),used=known.reduce((n,a)=>n+a.tokenUsage.outputTokens,0);
 const issues=m.items.filter(x=>x.measurement?.attempts.some(a=>a.status!=='success')).length;
 const issueNote=issues?'<p>本次 '+issues+' 项有接口交付异常，异常记录与正文评分分别展示；站长已确认的内容按确认结果计分。请展开原回答和判分说明核对。</p>':'';
 const usage=attempts.length?'接口回报累计输出 '+used.toLocaleString()+' token（含推理）'+(known.length<attempts.length?'；另有 '+(attempts.length-known.length)+' 次用量未知':'')+'。这是实际用量，和每次允许的输出额度不同。':'';
 const actual=caps.length?(Math.min(...caps).toLocaleString()+'—'+Math.max(...caps).toLocaleString()+' token'):'尚未发送';
 const setting=bounded?''+(m.limitAuthority==='service'?'服务商声明':'原厂声明')+'最大输出 '+m.maxOutputTokens.toLocaleString()+' token；本轮按剩余预算逐次分配，实际请求额度为 '+actual+'，已发送 '+m.requests+' 次。输出额度包含推理；'+(caps.length&&caps.every(c=>c===m.maxOutputTokens)?'本批已发送请求均采用该文档上限，未验证服务商是否内部裁剪。':'实际输出额度与按文档最大值请求的条件不同。')+'':m.maxOutputTokens===null?'最大输出量尚未核实，本型号本轮未发送请求，不计0分。':'本轮采用'+(m.limitAuthority==='model-publisher'?'原厂文档':'服务商公开配置')+'声明的最大输出 '+m.maxOutputTokens.toLocaleString()+' token；已实际发送 '+m.requests+' 次。';
 return `<section class="panel"><div class="panel-head"><h2>本轮只测 HIGH</h2><span>${bounded?'按剩余预算分配输出':'不再三档择优'}</span></div><div class="panel-body"><p>等待接口完成，不设客户端总时长。${setting}${budgetBlocked?'剩余预算无法承受下一次请求，未发送的项目保留未测。':''}</p>${usage?'<p>'+usage+'</p>':''}${issueNote}<p class="evidence-meta">${e(m.limitNote)} ${m.budgetAuthorization==='user-approved-existing-credits-20261031'?'本批经站长授权使用现有额度，已解除旧20%限制；旧未结算费用继续预留。':'历史批次沿用当时固定20%总上限；未知费用继续预留。'}每次完成后核对实际用量。推理强度按请求high记录，上游实际映射未独立验证。</p><a href="${e(m.limitSource)}" target="_blank" rel="noopener noreferrer">查看输出上限原始来源 ↗</a></div></section>`;
}
