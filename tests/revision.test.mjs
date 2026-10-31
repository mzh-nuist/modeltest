import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stats,csv,validateData,selectModels} from '../dist/lib.js';
import {measurementScope,comparisonScope,projectData} from '../dist/scope.js';
const read=()=>JSON.parse(fs.readFileSync(new URL('../dist/data/measured.json',import.meta.url),'utf8'));
const named=(d,name)=>d.models.find(m=>m.name.includes(name));

test('math selection stays at 50% across list, common-task comparison and CSV',()=>{
 const d=measurementScope(read(),{category:'math'}),claude=named(d,'Claude'),deep=named(d,'DeepSeek');
 const list=stats(d,claude.id),comp=comparisonScope(d,[claude.id,deep.id]);
 assert.equal(list.taskQuality,.5);assert.equal(stats(comp,claude.id).taskQuality,.5);
 assert.equal(stats(comp,claude.id).quality,.5);assert.equal(comp.tasks.length,3);
 const rows=csv(comp).split('\r\n');assert.equal(rows.length,3);assert.ok(rows.find(r=>r.includes(claude.name)).includes('"0.5"'));
 assert.ok(comp.tasks.every(t=>t.category==='math'));validateData(comp);
});
test('repeating one successful task cannot overweight distinct task quality',()=>{
 const d=read(),m=named(d,'Claude'),before=stats(d,m.id);
 assert.equal(before.quality,7/9);assert.ok(Math.abs(before.taskQuality-4/6)<1e-12);
 const source=d.runs.find(r=>r.modelId===m.id&&r.grading.status==='passed');
 d.runs.push({...structuredClone(source),id:'extra-repeat'});
 const after=stats(d,m.id);assert.equal(after.taskQuality,before.taskQuality);assert.notEqual(after.quality,before.quality);
});
test('request failures remain in rule delivery and completion even when graded answer passed',()=>{
 const d=read(),m=d.models.find(m=>m.name.includes('GLM')&&m.maxOutputTokens===1024)||d.models.find(m=>{const s=stats(d,m.id);return s.attempted===3&&s.successful===1});
 const s=stats(d,m.id);assert.equal(s.quality,1);assert.equal(s.completion,1/3);assert.equal(s.ruleDelivery,1/3); // all three first-batch tasks use rule graders; only one delivered a pass
});
test('common-task comparison intersects attempts rather than successful answers',()=>{
 const d=read(),paid=d.models.filter(m=>m.maxOutputTokens===1536).slice(0,2),c=comparisonScope(d,paid.map(m=>m.id));
 assert.ok(c.tasks.length);assert.ok(c.runs.some(r=>r.status!=='success'));
 const all=comparisonScope(d,d.models.map(m=>m.id));assert.equal(all.tasks.length,0);assert.equal(all.runs.length,0);validateData(all);
});
test('batch, task and visible-model export form a closed valid projection',()=>{
 const d=read();for(const b of d.batches){const task=b.taskIds[0],a=measurementScope(d,{batchId:b.id,taskId:task});
 const ids=selectModels(a,{query:a.models[0].family}).map(m=>m.id),out=projectData(a,{modelIds:ids});
 validateData(out);assert.ok(out.runs.every(r=>r.taskId===task&&ids.includes(r.modelId)));assert.ok(out.batches.every(x=>x.taskIds.every(id=>out.tasks.some(t=>t.id===id))));}
});
test('unknown public extension fields are discarded at every structural boundary',()=>{
 const d=read();d.internalNote='private';d.meta.internalNote='private';d.models[0].internalNote='private';d.runs[0].config.internalNote='private';d.runs[0].grading.internalNote='private';
 const result=validateData(d);assert.ok(!JSON.stringify(result).includes('internalNote'));assert.notEqual(result,d);assert.equal(d.internalNote,'private');
});
test('credential-shaped fields are rejected before unknown fields are stripped',()=>{
 for(const key of ['x-api-key','X_API_KEY','headers','cookie','refresh_token','credentials','auth-token']){const d=read();d.runs[0].config[key]='AUDIT_ONLY_FAKE';assert.throws(()=>validateData(d),/凭据/);}
});
test('cross-field timing and rate errors cannot import as measured data',()=>{
 for(const mutate of [r=>r.metrics.ttfaMs=r.metrics.durationMs+1,r=>r.metrics.ttftMs=r.metrics.durationMs+1,r=>{r.status='error';r.grading={status:'not_applicable',score:null,reason:'error'};r.metrics.outputTps=10;}]){
 const d=read();mutate(d.runs[0]);assert.throws(()=>validateData(d));}
});
test('reasoning token bounds depend on explicitly declared usage semantics',()=>{
 const d=read(),r=d.runs[0];r.metrics.outputTokens=10;r.metrics.reasoningTokens=20;
 assert.throws(()=>validateData(d),/计数语义/);r.provenance.usageSemantics='includes_reasoning';assert.throws(()=>validateData(d));
 r.provenance.usageSemantics='visible_only';assert.equal(validateData(d).runs[0].provenance.usageSemantics,'visible_only');
});
test('unknown failed-attempt fee also suppresses task-weighted cost',()=>{
 const d=read(),r=d.runs.find(r=>d.tasks.find(t=>t.id===r.taskId).grader.type!=='manual');r.metrics.cost=null;
 const s=stats(d,r.modelId);assert.equal(s.ruleCost,null);assert.equal(s.totalCost,null);assert.ok(s.unknownCosts>0);
});
