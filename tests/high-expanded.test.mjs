import {studioWorks,studioRepairs,studioArchive} from '../dist/studio-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectHighSuite,highPanel} from '../dist/high-suite.js';
import {mergeHighExpanded,expandedModels} from '../dist/high-expanded.js';
import {weightedSummary,RECEIPT_REVIEW_RULE} from '../dist/weighted-score.js';
import {publishedModel} from '../dist/published-daily.js';
import {trafficRoute} from '../dist/traffic.js';
import {validateTrafficEvent} from '../worker/index.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const bank=read('checkup.json'),doc=read('high-expanded.json');
const load=()=>projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),bank);

test('expanded batch replaces the pending Sonnet without duplicating original models or counts',()=>{
 const base=load(),before=structuredClone(base),result=mergeHighExpanded(base,doc,bank);
 assert.deepEqual(base,before);assert.equal(result.data.models.length,10);
 assert.equal(new Set(result.data.models.map(m=>m.id)).size,10);
 assert.deepEqual(result.book.highSource.models.slice(0,5),base.book.highSource.models.slice(0,5));
 assert.equal(result.data.totalRequests,65+doc.totalRequests);
 assert.equal(result.data.models.filter(m=>m.id==='claude-sonnet55').length,1);
 for(const id of Object.keys(expandedModels)){
  assert.equal(trafficRoute('#checkup/model/'+id),'checkup/model/'+id);
  assert.ok(validateTrafficEvent({eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),kind:'qa',route:'checkup/model/'+id,source:'direct',device:'desktop'}));
  assert.match(highPanel(result.book,id),/已解除旧20%限制/);
 }
 for(const id of ['qwen38-max','gpt61-sol']){assert.ok(!result.data.models.some(m=>m.id===id));assert.equal(trafficRoute('#checkup/model/'+id),null);}
});
test('expanded batch rejects mismatched source protocol, substituted models and credential fields',()=>{
 const reject=fn=>{const changed=structuredClone(doc);fn(changed);assert.throws(()=>mergeHighExpanded(load(),changed,bank));};
 reject(x=>x.collectionAuthorization='unapproved');reject(x=>x.models[0].apiModel='different-model');
 reject(x=>x.models[0].effort='xhigh');reject(x=>x.models[0].items[0].measurement.apiKey='secret');
 reject(x=>x.models[0].items[7].criteriaScores[0].id='wrong-criterion');reject(x=>x.tasks[0].weight=50);reject(x=>x.totalRequests++);
});

test('already collected but ungraded drawings and edits stay readable without inventing zero scores',()=>{
 const x=structuredClone(doc);
 for(const id of ['visual','edit']){const item=x.models[0].items.find(i=>i.taskId===id);item.score=null;}
 const result=mergeHighExpanded(load(),x,bank);
 assert.match(studioWorks(result.data,result.book,'visual'),/待评/);
 assert.doesNotThrow(()=>studioRepairs(result.data,result.book,bank));
});

test('self review keeps source hashes, reviewed receipt counts and the frozen memory boundary',()=>{
 const result=mergeHighExpanded(load(),doc,bank);
 assert.equal(doc.models.flatMap(m=>m.items).filter(x=>x.score!==null).length,40);
 for(const model of doc.models){
  assert.equal(model.requests,13);assert.equal(model.successfulRequests,13);
  for(const item of model.items)assert.match(item.measurement.sourceDigest,/^[a-f0-9]{64}$/);
 }
 const haiku=doc.models.find(m=>m.modelId==='claude-haiku55');
 assert.equal(haiku.items.find(i=>i.taskId==='memory').score,0);
 for(const [id,receiptScore,total] of [['claude-sonnet55',0,80],['claude-haiku55',0,68],['gemini38-flash',2,85]]){
  const m=result.book.models.find(m=>m.modelId===id),item=m.items.find(x=>x.taskId==='receipt');
  assert.equal(item.score,receiptScore);assert.equal(item.reviewer,'assistant');assert.match(item.reason,/主要结论/);
  assert.equal(weightedSummary(result.book,m).finalScore,total);
  assert.equal(weightedSummary(result.book,m).graded,8);
  const page=publishedModel(result.data,bank,id,result.book);
  assert.ok(page.includes(RECEIPT_REVIEW_RULE));assert.doesNotMatch(page,/待复核 \/ 20|尚未评完|评分待定/);
 }
 const archive=studioArchive(result.data,result.book);
 assert.equal((archive.match(/class="column-model-card"/g)||[]).length,10);
 assert.doesNotMatch(archive,/class="pending-model-card"/);
 assert.deepEqual(result.book.models.slice(0,5).map(m=>weightedSummary(result.book,m).finalScore),[77,80,63,90,72.5]);
 assert.equal(fs.existsSync(new URL('../dist/data/high-supplement.json',import.meta.url)),false);
});
