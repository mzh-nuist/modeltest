import {validateCheckupReport,previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
import {extractDrawing} from './completed-suite.js?v=20261101-short1';
import {weightedSummary,formatPoints} from './weighted-score.js?v=20261101-short1';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const EFFORTS=['low','medium','high'];
const total=(profile,tasks)=>profile.items.every(x=>x.score!==null)?Number(profile.items.reduce((n,x,i)=>n+x.score*tasks[i].weight/2,0).toFixed(4)):null;
export function selectBestProfile(profiles,tasks){
 const ordered=EFFORTS.map(effort=>profiles.find(p=>p.effort===effort));
 if(ordered.some(p=>!p))throw Error('三档记录缺失');
 const complete=ordered.filter(p=>total(p,tasks)!==null);
 const best=complete.reduce((winner,p)=>!winner||total(p,tasks)>total(winner,tasks)?p:winner,null);
 return {best,settled:complete.length===3,totals:Object.fromEntries(ordered.map(p=>[p.effort,total(p,tasks)]))};
}
export function validateEffortMatrix(matrix,legacy,bank){
 const fail=()=>{throw Error('三档记录与测试设置不一致');};
 if(matrix?.schemaVersion!=='daily-effort-v1'||matrix.suiteId!==legacy.suiteId||matrix.origin!=='publisher-local-api-effort-matrix'||matrix.scoreVersion!=='weighted-100-effort-v1'||matrix.selectionPolicy!=='max-whole-suite'||JSON.stringify(matrix.requestedEfforts)!==JSON.stringify(EFFORTS)||JSON.stringify(matrix.tieBreak)!==JSON.stringify(EFFORTS)||JSON.stringify(matrix.tasks)!==JSON.stringify(legacy.tasks)||matrix.conditions?.maxOutputTokens!==16384||matrix.conditions.timeoutSeconds!==300||matrix.conditions.retries!==0||matrix.conditions.temperature!==null||matrix.plannedRequests!==195||matrix.models?.length!==5||!Number.isFinite(Date.parse(matrix.updatedAt)))fail();
 let requests=0,successes=0;
 matrix.models.forEach((m,i)=>{
  if(m.modelId!==legacy.models[i].modelId||m.profiles?.length!==3||m.provider!=='CommandCode')fail();
  m.profiles.forEach((p,j)=>{
   if(p.effort!==EFFORTS[j]||p.items?.length!==8||p.upstreamEffortVerified!==false||![true,false,null].includes(p.parameterAccepted)||!/^[a-f0-9]{64}$/.test(p.sourceDigest))fail();
   let calls=0,ok=0,accepted=false;
   p.items.forEach((x,k)=>{
    const t=matrix.tasks[k];if(x.taskId!==t.id||x.score!==null&&(!Number.isFinite(x.score)||x.score<0||x.score>2)||typeof x.reason!=='string')fail();
    if(k<6&&x.score!==null&&![0,1,2].includes(x.score))fail();
    const a=x.measurement;if(!a){if(x.score!==null)fail();return;}
    if(a.effort!==p.effort||a.apiModel!==m.apiModel||a.provider!==m.provider||a.condition!==`${p.effort} reasoning; cap16384; timeout300; no retries`||!/^[a-f0-9]{64}$/.test(a.sourceDigest)||!Number.isFinite(Date.parse(a.checkedAt))||!['success','error','timeout','incomplete','not_run'].includes(a.status)||typeof a.output!=='string'||a.output.length>150000||a.outputs?.length!==t.prompts.length||a.outputs.some(o=>o!==null&&(typeof o!=='string'||o.length>150000))||!Array.isArray(a.attempts)||a.attempts.length>t.prompts.length)fail();
    a.attempts.forEach((attempt,n)=>{if(attempt.step!==n+1||!['success','error','timeout'].includes(attempt.status)||typeof attempt.output!=='string')fail();calls++;ok+=attempt.status==='success';accepted||=attempt.httpStatus===200;});
    if(a.output!==(a.outputs.at(-1)||''))fail();
    if(a.status==='success'&&(a.outputs.some(o=>!o)||a.attempts.length!==t.prompts.length||a.attempts.some(at=>at.status!=='success')))fail();
    if(x.score!==null&&(!a.attempts.length||a.status!=='success'&&x.score!==0))fail();
    if(k===2&&x.score===2&&a.output.trim()!==bank.tasks[2].exactAnswer.trim())fail();
    if(k===6&&(a.imageSha256!==t.imageSha256||x.score!==null&&![0,2].includes(x.score)))fail();
    if(k>=5&&k!==6&&x.score>0){const pic=extractDrawing(a.output);if(!previewableCheckupSVG(pic.svg))fail();}
    if(k===7&&x.score!==null){const pic=extractDrawing(a.output),valid=a.status==='success'&&previewableCheckupSVG(pic.svg);if(!valid){if(x.score!==0||x.criteriaScores?.length)fail();}else if(x.criteriaScores?.length!==4||x.criteriaScores.some((c,n)=>!Number.isInteger(c.awarded)||c.awarded<0||c.awarded>t.criteria[n].max||typeof c.reason!=='string')||Math.abs(x.criteriaScores.reduce((n,c)=>n+c.awarded,0)-x.score*7.5)>1e-7)fail();}
   });
   if(p.requests!==calls||p.successfulRequests!==ok||p.parameterAccepted!==(calls?accepted:null))fail();requests+=calls;successes+=ok;
  });
 });
 if(matrix.totalRequests!==requests||matrix.successfulRequests!==successes||requests>195)fail();return matrix;
}
export function projectEffortMatrix(matrix,legacyData,legacySuite,bank,overrides={}){
 const rows=[],models=[];
 matrix.models.forEach((m,i)=>{
  const pick=selectBestProfile(m.profiles,matrix.tasks),profile=m.profiles.find(p=>p.effort===overrides[m.modelId])||pick.best||m.profiles.reduce((a,b)=>a.items.filter(x=>x.score!==null).length>=b.items.filter(x=>x.score!==null).length?a:b);
  const row={modelId:m.modelId,sourceDigest:profile.sourceDigest,items:profile.items,selectionFinal:pick.settled};rows.push(row);
  const report={schemaVersion:'daily-checkup-report-v1',suiteId:bank.suiteId,kind:'imported',modelLabel:m.name,checkedAt:profile.checkedAt,conditions:`请求${profile.effort}；16384输出上限；300秒；无重试。`,runs:bank.tasks.map((t,j)=>{const a=profile.items[j].measurement;return {taskId:t.id,status:!a?.attempts.length?'not_run':a.status==='success'?'complete':'incomplete',outputs:a?.outputs||t.prompts.map(()=>null),review:null,note:!a?'本档本项尚未发送。':a.status==='success'?'':a.error||'本档本项未完整交付。'};})};
  validateCheckupReport(report,bank);
  models.push({...legacyData.models[i],name:m.name,apiModel:m.apiModel,provider:m.provider,checkedAt:profile.checkedAt,sourceDigest:profile.sourceDigest,report,
   checks:profile.items.slice(0,6).map((x,j)=>({taskId:x.taskId,label:report.runs[j].status!=='complete'?'未完成':x.score===2?'主要内容通过':'需要复核',note:x.reason,origin:j===2?'rule':'assistant'})),
   selectedEffort:profile.effort,bestEffort:pick.best?.effort||null,selectionFinal:pick.settled});
 });
 return {data:{...legacyData,models,totalRequests:matrix.totalRequests,successfulRequests:matrix.successfulRequests,publishedAt:matrix.updatedAt,effortMatrix:true},
  book:{...legacySuite,schemaVersion:'daily-weighted-v4',scoreVersion:matrix.scoreVersion,condition:'three-explicit-efforts',updatedAt:matrix.updatedAt,tasks:matrix.tasks,models:rows,matrix}};
}
export function effortPanel(book,modelId){
 if(!book?.matrix)return '';const m=book.matrix.models.find(m=>m.modelId===modelId),pick=selectBestProfile(m.profiles,book.tasks);
 return `<section class="panel effort-panel"><div class="panel-head"><h2>三档各跑一整套</h2><span>${pick.settled?'最高分档已确定':'三档尚未全部评完'}</span></div><div class="panel-body"><p>取完整八项总分最高的一档；同分优先low，再medium、high。不会拼接每题最高分。这是三档择优成绩，不是平均分或稳定性成绩。</p><div class="effort-profile-grid">${m.profiles.map(p=>`<a class="effort-profile ${pick.best?.effort===p.effort?'is-best':''}" href="#checkup/model/${e(modelId)}/${p.effort}"><span>${p.effort.toUpperCase()} ${pick.best?.effort===p.effort?(pick.settled?'· 最高档':'· 暂选'):''}</span><strong>${pick.totals[p.effort]===null?'待评':formatPoints(pick.totals[p.effort])}<small>/100</small></strong><span>${p.items.filter(i=>i.score!==null).length}/8项已评 · ${p.successfulRequests}/${p.requests}请求成功</span></a>`).join('')}</div><p class="evidence-meta">每档按对应reasoning_effort参数发送；HTTP接受不等于独立验证了上游实际推理强度。共同设置：16384输出token、300秒、无重试。旧默认档另存历史。</p></div></section>`;
}
export function effortOverview(book){return `<div class="page-head"><div><div class="eyebrow">逐风 / THREE EFFORTS</div><h1>同一模型，三档完整答卷。</h1><p class="subtitle">low、medium、high各跑八项，取整套总分最高档；同分优先low。</p></div><a href="#checkup">← 返回成绩单</a></div>${book.matrix.models.map(m=>`<section><h2>${e(m.name)}</h2>${effortPanel(book,m.modelId)}</section>`).join('')}`;}
