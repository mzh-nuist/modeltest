import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gradeShort,simulateBoss,minimumGearCuts,gearFeasible} from '../dist/short-challenge-engine.js';
import {validateShortBank,validateShortResults,shortTaskPage} from '../dist/short-challenges.js';
const bank=JSON.parse(fs.readFileSync(new URL('../dist/data/short-challenges.json',import.meta.url),'utf8'));
test('frozen references solve both Sokoban boards and both gear controls',()=>{
  for(const task of bank.tasks)for(const c of task.cases){const output=typeof c.reference==='string'?c.reference:JSON.stringify(c.reference);assert.equal(gradeShort(task,c,output).total,100);}
  assert.deepEqual(minimumGearCuts(bank.tasks[1].cases[0]),{minimum:1,solutions:[['BC'],['CD']]});
  assert.deepEqual(minimumGearCuts(bank.tasks[1].cases[1]),{minimum:0,solutions:[[]]});
});
test('Sokoban stops at illegal moves, rejects oversized plans and does not select among candidates',()=>{
  const [t]=bank.tasks,c=t.cases[0];assert.equal(simulateBoss(c,'D').illegalAt,1);
  assert.equal(gradeShort(t,c,'D').content,0);assert.equal(gradeShort(t,c,c.reference+'U').content,0);
  assert.equal(gradeShort(t,c,'U'.repeat(300)).content,0);
  assert.equal(gradeShort(t,c,c.reference+'\nUU').content,0);
  assert.equal(gradeShort(t,c,'```\n'+c.reference+'\n```').content,80);
  assert.equal(gradeShort(t,c,'```\n'+c.reference+'\n```').format,0);
});
test('gear repairs must be minimal, connected and unique; backward edge names are accepted',()=>{
  const t=bank.tasks[1],c=t.cases[0];
  assert.equal(gradeShort(t,c,'{"can":false,"cut":["DC"]}').total,100);
  for(const cut of [[],['AB'],['BC','BC'],['BC','CD'],['AC'],['AB','EA']])assert.equal(gradeShort(t,c,JSON.stringify({can:false,cut})).content,20);
  assert.equal(gearFeasible(['A','B','C'],['AB']),false);
  assert.equal(gradeShort(t,c,'{"can":true,"can":false,"cut":["BC"]}').content,0);
  assert.equal(gradeShort(t,c,'{"can":false,"cut":["BC"]} {"can":true,"cut":[]}').content,0);
  assert.equal(gradeShort(t,c,'```json\n{"can":false,"cut":["BC"]}\n```').total,90);
});
test('incomplete transport never earns content or complete delivery credit',()=>{
  for(const t of bank.tasks)for(const c of t.cases)assert.equal(gradeShort(t,c,JSON.stringify(c.reference),'truncated').total,0);
});
test('short question views preserve inert outputs, clear sources and old-score navigation',()=>{
  validateShortBank(bank);
  const t=bank.tasks[0],c=t.cases[0],r={modelId:'fixture',name:'<img src=x onerror=alert(1)>',apiModel:'fixture',provider:'offline-fixture',taskId:t.id,caseId:c.id,status:'success',output:'<script>alert(1)</script>',sourceDigest:'a'.repeat(64),effort:'high',maxOutputTokens:16384,tokenUsage:{}};
  r.grade=gradeShort(t,c,r.output,r.status);
  const results={schemaVersion:'short-results-v1',suiteId:bank.suiteId,scoreVersion:bank.scoreVersion,maxOutputTokens:16384,effort:'high',repeatsPerCase:1,automaticRetries:0,records:[r],modelCalls:1,successfulRequests:1};
  validateShortResults(results,bank);const html=shortTaskPage(bank,results,t.id);
  assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script|<img src=x/);
  assert.match(html,/出题方示意 · 非模型答卷/);assert.match(html,/href="#checkup\/results"/);
  assert.match(html,/未完成采集，不补零/);assert.doesNotMatch(html,/<details[^>]+open/);
  const bad=structuredClone(results);bad.records[0].grade.content=80;assert.throws(()=>validateShortResults(bad,bank));
  assert.throws(()=>validateShortResults({...results,records:[r,r],modelCalls:2,successfulRequests:2},bank));
});
