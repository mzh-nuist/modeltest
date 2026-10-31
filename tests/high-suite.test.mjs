import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateHighSuite,projectHighSuite} from '../dist/high-suite.js';
import {publishedHome,publishedModel} from '../dist/published-daily.js';
import {weightedSummary,siteRating,siteStars,weightedScoreboard} from '../dist/weighted-score.js';
import {receiptView} from '../dist/receipt-test.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const h=read('high-suite.json'),old=read('completed-suite.json'),bank=read('checkup.json'),data=read('daily-measured.json'),limits=read('high-model-limits.json');

test('card progress explicitly means scored tasks rather than passed tasks',()=>{
 const p=projectHighSuite(h,data,old,bank),html=weightedScoreboard(p.data,p.book);
 const card=html.match(/<article class="suite-model[^\"]*" data-suite-model="deepseek-v41-flash">([\s\S]*?)<\/article>/)[1];
 const progress=card.match(/<div class="score-passed"[^>]*>([\s\S]*?)<\/div>/)[1];
 assert.match(progress,/已评完/);assert.match(progress,/8项/);assert.doesNotMatch(progress,/<small>\s*\/\s*8|需改进|全通过/);
 assert.equal(weightedSummary(p.book,p.book.models[0]).passed,6);
 const pending=structuredClone(p.book);pending.models[0].items[6].score=null;pending.models[0].selectionFinal=false;
 const incomplete=weightedScoreboard(p.data,pending).match(/<article class="suite-model[^\"]*" data-suite-model="deepseek-v41-flash">([\s\S]*?)<\/article>/)[1];
 assert.match(incomplete,/已评7项/);assert.match(incomplete,/共8项/);assert.doesNotMatch(incomplete,/已评完/);
});

test('receipt is presented as a playful challenge while scores and evidence stay unchanged',()=>{
 const p=projectHighSuite(h,data,old,bank),before=JSON.stringify(p.book);
 const home=publishedHome(p.data,bank,p.book);assert.match(home,/整活/);assert.match(home,/分数只算这套题/);
 const page=receiptView(read('receipt-test.json'),p.data.models,p.book);
 const visible=page.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 assert.match(visible,/整活/);assert.match(visible,/出题者/);
 assert.match(publishedModel(p.data,bank,'deepseek-v41-flash',p.book),/账单整活题/);
 assert.equal(JSON.stringify(p.book),before);assert.equal(weightedSummary(p.book,p.book.models[0]).finalScore,77);
 assert.equal(p.book.models[0].items[6].score,0);
});

test('published site stars use completed measured scores and stay independent from personal votes',()=>{
 const p=projectHighSuite(h,data,old,bank),before=JSON.stringify(p.book);
 assert.deepEqual(p.book.models.map(row=>[row.modelId,siteRating(p.book,row)]),[['deepseek-v41-flash',3],['kimi-k31-pro',4],['kimi-k3',2],['glm53-flash',5],['minimax-m31-flash',3]]);
 const one=weightedScoreboard(p.data,p.book,{ratings:{'kimi-k3':5}}),two=weightedScoreboard(p.data,p.book,{ratings:{'kimi-k3':1}});
 assert.match(one,/本站星级/);assert.equal(one,two);assert.equal(JSON.stringify(p.book),before);
 const missing=structuredClone(p.book.models[0]);missing.items[0].score=null;
 assert.equal(siteRating(p.book,missing),null);assert.doesNotMatch(siteStars(p.book,missing),/★/);
});

test('site star grade changes only at the disclosed score boundaries',()=>{
 const suite={tasks:[{weight:100}],passingScore:80};
 for(const [score,stars] of [[0,1],[59.5,1],[60,2],[69.5,2],[70,3],[79.5,3],[80,4],[89.5,4],[90,5],[100,5]]){
  assert.equal(siteRating(suite,{items:[{score:score/50}]}),stars,String(score));
 }
});
test('high only binds actual maximum settings and refuses fabricated scores for untested models',()=>{
 assert.equal(validateHighSuite(h,old,bank,limits),h);
 for(const change of [s=>s.effort='low',s=>s.timeoutSeconds=300,s=>{s.models[2].items[0].measurement=null;s.models[2].items[0].score=2;},s=>s.models[3].maxOutputTokens=16384,s=>s.models[3].items[0].measurement.effort='medium',s=>s.models[0].limitSource='https://example.com/unsupported']){const s=structuredClone(h);change(s);assert.throws(()=>validateHighSuite(s,old,bank,limits));}
});
test('the live views show high-only conditions and keep missing upper limits ungraded',()=>{
 const projected=projectHighSuite(h,data,old,bank),home=publishedHome(projected.data,bank,projected.book);
 assert.doesNotMatch(home,/本轮只测 HIGH，等接口完成。/);assert.doesNotMatch(home,/三档各跑一套，取总分最高档/);
 const glm=publishedModel(projected.data,bank,'glm53-flash',projected.book);assert.match(glm,/本轮只测 HIGH/);assert.match(glm,/131,072|131072/);assert.doesNotMatch(glm,/三档各跑一整套|画图补测 · low/);
 const pending=publishedModel(projected.data,bank,'kimi-k3',projected.book);assert.match(pending,/1,048,576|1048576/);assert.match(pending,/预算/);assert.doesNotMatch(pending,/最大输出量尚未核实/);
 assert.match(publishedModel(projected.data,bank,'deepseek-v41-flash',projected.book),/原厂文档/);
});

test('Kimi budget-derived caps stay distinct from declared model maximum',()=>{
 assert.equal(h.outputPolicy,'per-model-recorded');
 const kimi=h.models[1];assert.equal(kimi.outputPolicy,'budget-bounded-output');
 assert.ok(kimi.items.flatMap(x=>x.measurement?.attempts||[]).every(a=>a.maxOutputTokens<=kimi.maxOutputTokens));
 for(const change of [s=>s.models[1].items[0].measurement.attempts[0].maxOutputTokens=1048577,s=>s.models[1].outputPolicy='service-declared-maximum']){const changed=structuredClone(h);change(changed);assert.throws(()=>validateHighSuite(changed,old,bank,limits));}
 const projected=projectHighSuite(h,data,old,bank),page=publishedModel(projected.data,bank,'kimi-k31-pro',projected.book);assert.match(page,/按剩余预算分配输出/);assert.match(page,/实际请求额度/);
 assert.match(page,/接口回报累计输出/);assert.match(page,/这是实际用量/);
});

test('owner can approve correct content without rewriting failed transport evidence',()=>{
 const x=h.models[2].items[0];assert.equal(x.measurement.status,'error');assert.equal(x.score,2);assert.equal(x.reviewer,'site-owner');assert.match(x.measurement.output,/开车/);assert.match(x.reason,/不扣正文分/);
 for(const change of [s=>delete s.models[2].items[0].adjudication,s=>s.models[2].items[0].reviewer='assistant-first-pass',s=>s.models[2].items[0].measurement.attempts[0].streamDone=false,s=>s.models[2].items[0].measurement.status='timeout']){const bad=structuredClone(h);change(bad);assert.throws(()=>validateHighSuite(bad,old,bank,limits));}
});

test('owner adjudication makes Kimi K3 final 63 while keeping receipt primary answer wrong',()=>{
 const x=h.models[2].items[6];assert.equal(x.measurement.status,'success');assert.equal(x.score,0);assert.equal(x.reviewer,'site-owner');assert.match(x.reason,/主要结论/);
 const projected=projectHighSuite(h,data,old,bank),summary=weightedSummary(projected.book,projected.book.models[2]);
 assert.equal(summary.finalScore,63);assert.equal(summary.graded,8);assert.equal(summary.remaining,0);
 const page=publishedModel(projected.data,bank,'kimi-k3',projected.book);assert.match(page,/站长确认/);assert.doesNotMatch(page,/待复核 \/ 20/);
});
