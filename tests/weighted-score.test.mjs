import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {validateWeightedSuite,weightedSummary,weightedScoreboard,weightedModelSummary,weightedRubric,points} from '../dist/weighted-score.js';
import {publishedHome,publishedTask,publishedModel} from '../dist/published-daily.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const suite=read('../dist/data/weighted-suite.json'),data=read('../dist/data/daily-measured.json'),old=read('../dist/data/daily-scores.json'),bank=read('../dist/data/checkup.json');
test('seven weights sum to 100, bind original prompts and preserve original judgments',()=>{
  assert.equal(validateWeightedSuite(suite,data,old,bank),suite);assert.deepEqual(suite.tasks.map(t=>t.weight),[10,15,15,15,15,10,20]);
  assert.equal(suite.sourceScorebookSha256,createHash('sha256').update(fs.readFileSync(new URL('../dist/data/daily-scores.json',import.meta.url))).digest('hex'));
  for(const change of [s=>s.tasks[0].weight=11,s=>s.tasks[0].prompts[0]='new question',s=>s.models[0].sourceDigest='x',s=>s.models[0].items[0].score=0,s=>s.models[0].items[6].score=2,s=>s.models[0].items.pop()]){const s=structuredClone(suite);change(s);assert.throws(()=>validateWeightedSuite(s,data,old,bank));}
});
test('known evidence earns points out of 100 without normalizing or zeroing pending vision',()=>{
  assert.deepEqual(suite.models.map(r=>weightedSummary(suite,r).earned),[62.5,70,70,60,70]);
  for(const row of suite.models){const s=weightedSummary(suite,row);assert.equal(s.evaluated,80);assert.equal(s.remaining,20);assert.equal(s.graded,6);assert.equal(s.complete,false);assert.equal(s.qualified,false);assert.equal(s.finalScore,null);}
  assert.equal(points(1,15),7.5);assert.equal(points(null,20),null);
});
test('80 and 90 thresholds require complete evidence; this fixture does not change published results',()=>{
  const r=structuredClone(suite.models[1]);r.items[6].score=2;let s=weightedSummary(suite,r);assert.equal(s.finalScore,90);assert.equal(s.grade,'优秀');assert.equal(s.qualified,true);
  r.items[6].score=0;s=weightedSummary(suite,r);assert.equal(s.finalScore,70);assert.equal(s.grade,'需改进');assert.equal(s.qualified,false);
  r.items.forEach(x=>x.score=2);assert.equal(weightedSummary(suite,r).finalScore,100);
  r.items.forEach(x=>x.score=null);s=weightedSummary(suite,r);assert.equal(s.finalScore,null);assert.equal(s.remaining,100);
  const glm=structuredClone(suite.models[3]);glm.items[6].score=2;assert.equal(weightedSummary(suite,glm).grade,'合格');
});
test('home, model and task views consistently show weighted points and pending question',()=>{
  const home=publishedHome(data,bank,suite);assert.equal((home.match(/data-suite-model=/g)||[]).length,5);assert.match(home,/62.5/);assert.match(home,/待测20分|账单识别 20 分待测/);assert.match(home,/<b>100<\/b>分制/);
  const model=publishedModel(data,bank,data.models[1].id,suite);assert.match(model,/七项百分制/);assert.match(model,/最终可能范围 70—90 分/);assert.match(model,/7. 账单图片识别 · 20分/);assert.doesNotMatch(model,/六项测试集 · .*12 分/);
  const task=publishedTask(data,bank,'honesty',suite);assert.match(task,/7.5 \/ 15 分/);assert.match(task,/扣7.5分/);
});
test('qualified filter stays empty until measured; personal stars stay independent',()=>{
  const original=JSON.stringify(suite);const html=weightedScoreboard(data,suite,{ratings:{'kimi-k3':5},filter:'starred'});assert.equal((html.match(/data-suite-model=/g)||[]).length,1);assert.equal(JSON.stringify(suite),original);
  assert.match(weightedScoreboard(data,suite,{filter:'passed'}),/暂无模型完成七项并达到80分/);
  assert.match(weightedModelSummary(suite,suite.models[0],data.models[0]),/待测 20 分/);
});
test('all question prompts and scoring anchors are readable and escaped',()=>{
  const html=weightedRubric(suite);assert.match(html,/80分合格/);assert.match(html,/账单识别只判对错/);assert.equal((html.match(/weighted-prompt/g)||[]).length,12);
  const s=structuredClone(suite);s.models[0].items[0].weightedNote='<img src=x onerror=alert(1)>';const out=weightedScoreboard(data,s);assert.match(out,/&lt;img/);assert.doesNotMatch(out,/<img src=x/);
});
