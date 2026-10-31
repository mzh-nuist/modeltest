import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateCompletedSuite,completionBody,zebraPage} from '../dist/completed-suite.js';
import {weightedSummary} from '../dist/weighted-score.js';
import {publishedHome,publishedModel} from '../dist/published-daily.js';
import {receiptView,createReceiptController} from '../dist/receipt-test.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+p,import.meta.url),'utf8'));
const suite=read('completed-suite.json'),data=read('daily-measured.json'),old=read('daily-scores.json'),bank=read('checkup.json');
test('eight-task evidence binds legacy judgments and new measurements',()=>{
 assert.equal(validateCompletedSuite(suite,data,old,bank),suite);assert.equal(suite.newRequests,10);assert.equal(suite.newSuccesses,9);
 assert.deepEqual(suite.models.map(r=>weightedSummary(suite,r).finalScore),[56.5,55,69,76,68]);
 for(const r of suite.models){assert.equal(weightedSummary(suite,r).evaluated,100);assert.equal(weightedSummary(suite,r).remaining,0);}
 for(const change of [s=>s.tasks[7].weight=16,s=>s.models[0].items[6].measurement.imageSha256='bad',s=>s.models[0].items[0].score=0,s=>s.models[2].items[7].criteriaScores[0].awarded=4,s=>s.models[1].items[7].score=1,s=>s.newSuccesses=10]){const s=structuredClone(suite);change(s);assert.throws(()=>validateCompletedSuite(s,data,old,bank));}
});
test('views expose receipt and zebra evidence and completed totals',()=>{
 const home=publishedHome(data,bank,suite);assert.match(home,/挑战题库/);assert.match(home,/56.5/);assert.match(home,/#checkup\/zebra/);assert.doesNotMatch(home,/账单识别 20 分待测/);
 const model=publishedModel(data,bank,data.models[2].id,suite);assert.match(model,/八项百分制/);assert.match(model,/14 \/ 15/);assert.doesNotMatch(model,/尚未向本模型发送原图/);
 const receipt=receiptView(read('receipt-test.json'),data.models,suite);assert.match(receipt,/20 \/ 20/);assert.match(receipt,/0 \/ 20/);assert.doesNotMatch(receipt,/没有新增真实API调用/);
 const gallery=zebraPage(suite,data);assert.equal((gallery.match(/<iframe /g)||[]).length,4);assert.match(gallery,/180|timeout|超时/);
});
test('model HTML is escaped and timeout cannot fabricate art',()=>{
 const s=structuredClone(suite);s.models[0].items[6].measurement.output='<img src=x onerror=alert(1)>';
 const out=completionBody(s,s.models[0],'receipt');assert.match(out,/&lt;img/);assert.doesNotMatch(out,/<img src=x/);
 const timed=completionBody(s,s.models[1],'zebra');assert.doesNotMatch(timed,/<iframe/);assert.match(timed,/没有完整/);
 assert.match(completionBody(s,s.models[2],'zebra'),/sandbox/);
});
test('receipt controller preserves the loaded scorebook on asynchronous rerender',async()=>{
 const beforeFetch=globalThis.fetch,beforeLocation=globalThis.location;
 try{
  globalThis.location={hash:'#checkup/receipt'};globalThis.fetch=async()=>({ok:true,json:async()=>read('receipt-test.json')});
  let ready;const loaded=new Promise(r=>{ready=r});
  const controller=createReceiptController({main:{addEventListener(){}},rerender:()=>ready()});
  controller.render(data.models,suite);await loaded;
  const html=controller.render(data.models,suite);assert.match(html,/20 \/ 20/);assert.match(html,/0 \/ 20/);assert.doesNotMatch(html,/receipt-pending/);
 }finally{globalThis.fetch=beforeFetch;globalThis.location=beforeLocation;}
});
