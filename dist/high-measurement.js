import {extractDrawing} from './completed-suite.js?v=20261101-short1';
import {previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
export function validateHighMeasurement(doc,book,bank,registry,schema){
 const fail=()=>{throw Error('补测答卷与本期 high 协议不一致');};
 const digest=x=>/^[a-f0-9]{64}$/.test(x),known=Object.keys(registry);
 if(/"(?:apiKey|authorization|monthlyCredits|purchasedCredits|freeCredits|totalUsd|reasoningOutput|_raw)"\s*:/i.test(JSON.stringify(doc)))fail();
 if(doc?.schemaVersion!==schema||doc.suiteId!==book.suiteId||doc.scoreVersion!==book.scoreVersion||doc.effort!=='high'||doc.timeoutSeconds!==null||doc.automaticRetries!==0||JSON.stringify(doc.tasks)!==JSON.stringify(book.tasks)||!Number.isFinite(Date.parse(doc.updatedAt))||doc.models?.length!==known.length)fail();
 let calls=0,successes=0;
 doc.models.forEach((m,i)=>{
  const spec=registry[known[i]];
  if(m.modelId!==known[i]||m.name!==spec.name||m.apiModel!==spec.apiModel||m.provider!=='CommandCode'||m.effort!=='high'||!digest(m.sourceDigest)||m.items?.length!==8||!['service','model-publisher'].includes(m.limitAuthority)||!/^https:\/\//.test(m.limitSource)||!digest(m.limitSourceDigest)||!['eligible','high-unlisted','plan-restricted'].includes(m.eligibility)||typeof m.eligibilityReason!=='string'||!m.eligibilityReason.trim()||!Number.isFinite(Date.parse(m.checkedAt)))fail();
  let n=0,ok=0;
  m.items.forEach((x,j)=>{
   const t=book.tasks[j],a=x.measurement;
   if(x.taskId!==t.id||typeof x.reason!=='string'||x.score!==null&&(!Number.isFinite(x.score)||x.score<0||x.score>2)||j<6&&x.score!==null&&![0,1,2].includes(x.score)||j===6&&x.score!==null&&![0,2].includes(x.score))fail();
   if(!a){if(x.score!==null)fail();return;}
   if(m.eligibility!=='eligible'||a.effort!=='high'||a.apiModel!==m.apiModel||a.provider!==m.provider||a.maxOutputTokens!==m.maxOutputTokens||a.outputPolicy!==m.outputPolicy||a.timeoutSeconds!==null||!digest(a.sourceDigest)||a.outputs?.length!==t.prompts.length||a.outputs.some(o=>o!==null&&typeof o!=='string')||a.output!==(a.outputs.at(-1)||'')||!Array.isArray(a.attempts)||a.attempts.length>t.prompts.length||!['success','error','timeout','incomplete','not_run'].includes(a.status))fail();
   if((a.status==='not_run')!==(a.attempts.length===0)||!a.attempts.length&&a.outputs.some(o=>o!==null))fail();
   a.attempts.forEach((at,k)=>{if(at.step!==k+1||!['success','error','timeout'].includes(at.status)||!Number.isInteger(at.maxOutputTokens)||at.maxOutputTokens<8192||at.maxOutputTokens>m.maxOutputTokens||at.tokenUsage?.outputTokens>at.maxOutputTokens)fail();n++;ok+=at.status==='success';});
   if(a.status==='success'&&(a.outputs.some(o=>typeof o!=='string'||!o.trim())||a.attempts.length!==t.prompts.length||a.attempts.some(at=>at.status!=='success')))fail();
   if(x.score!==null&&(!a.attempts.length||a.status!=='success'))fail();
   if(j===2&&x.score===2&&a.output.trim()!==bank.tasks[2].exactAnswer.trim())fail();
   if(j===6&&a.imageSha256!==t.imageSha256)fail();
   if((j===5||j===7)&&x.score>0&&!previewableCheckupSVG(extractDrawing(a.output).svg))fail();
   if(j===7&&x.score!==null&&x.score>0&&(x.criteriaScores?.length!==4||x.criteriaScores.some((c,k)=>c.id!==t.criteria[k].id||!Number.isInteger(c.awarded)||c.awarded<0||c.awarded>t.criteria[k].max)||Math.abs(x.criteriaScores.reduce((n,c)=>n+c.awarded,0)-x.score*7.5)>1e-7))fail();
  });
  if(m.requests!==n||m.successfulRequests!==ok||n>0&&(!Number.isInteger(m.maxOutputTokens)||m.outputPolicy!=='budget-bounded-output'))fail();
  calls+=n;successes+=ok;
 });
 if(doc.totalRequests!==calls||doc.successfulRequests!==successes)fail();return doc;
}
