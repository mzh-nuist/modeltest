import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {selectBestProfile,validateEffortMatrix,projectEffortMatrix,effortPanel} from '../dist/effort-matrix.js';
import {weightedSummary,weightedScoreboard} from '../dist/weighted-score.js';
import {publishedModel} from '../dist/published-daily.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+p,import.meta.url),'utf8'));
const suite=read('completed-suite.json'),bank=read('checkup.json'),data=read('daily-measured.json');
const profile=(effort,scores)=>({effort,items:scores.map((score,i)=>({taskId:suite.tasks[i].id,score,reason:'fixture'}))});
test('chooses the greatest whole-suite score, never a per-task composite',()=>{
 const profiles=[profile('high',[0,0,0,0,0,0,2,2]),profile('medium',[1,1,1,1,1,1,1,1]),profile('low',[2,2,2,2,2,2,0,0])];
 const p=selectBestProfile(profiles,suite.tasks);assert.equal(p.best.effort,'low');assert.equal(p.totals.low,65);assert.equal(p.totals.medium,50);assert.equal(p.totals.high,35);assert.equal(p.settled,true);
 assert.notEqual(p.totals[p.best.effort],100);
});
test('ties prefer low then medium; pending high prevents final selection',()=>{
 const a=profile('low',Array(8).fill(2)),b=profile('medium',Array(8).fill(2)),c=profile('high',Array(8).fill(2));
 assert.equal(selectBestProfile([c,b,a],suite.tasks).best.effort,'low');a.items[0].score=0;assert.equal(selectBestProfile([a,b,c],suite.tasks).best.effort,'medium');
 c.items[7].score=null;const p=selectBestProfile([a,b,c],suite.tasks);assert.equal(p.settled,false);assert.equal(p.best.effort,'medium');
 const row={items:b.items,selectionFinal:false};assert.equal(weightedSummary(suite,row).finalScore,null);assert.equal(weightedSummary(suite,row).qualified,false);assert.equal(weightedSummary(suite,row).possibleMax,100);
});
test('actual matrix validates settings, original image, counters and independent effort evidence',()=>{
 const m=read('effort-matrix.json');assert.equal(validateEffortMatrix(m,suite,bank),m);
 for(const mutate of [x=>x.conditions.timeoutSeconds=180,x=>x.selectionPolicy='per-task-max',x=>x.models[0].profiles[0].upstreamEffortVerified=true,x=>x.totalRequests++,x=>x.models[0].profiles[0].items[0].measurement.effort='high']){const x=structuredClone(m);mutate(x);assert.throws(()=>validateEffortMatrix(x,suite,bank));}
 const projected=projectEffortMatrix(m,data,suite,bank);assert.equal(projected.data.models.length,5);
 const model=publishedModel(projected.data,bank,data.models[0].id,projected.book);assert.match(model,/三档各跑一整套/);assert.match(model,/当前查看：low|当前查看：medium|当前查看：high/);assert.doesNotMatch(model,/首轮默认档：/);
 const html=weightedScoreboard(projected.data,projected.book);assert.match(html,/LOW|MEDIUM|HIGH/);assert.match(effortPanel(projected.book,data.models[0].id),/不会拼接每题最高分/);
});
