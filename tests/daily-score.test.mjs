import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateDailyScores,suiteSummary,suiteScoreboard,readRatings,saveRatings,ratingBatchKey} from '../dist/daily-score.js';
import {publishedHome,publishedTask} from '../dist/published-daily.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const data=read('../dist/data/daily-measured.json'),bank=read('../dist/data/checkup.json'),book=read('../dist/data/daily-scores.json');

test('six-task scores are bound to exact source reports and only default conditions',()=>{
  assert.equal(validateDailyScores(book,data,bank),book);
  assert.deepEqual(book.models.map(suiteSummary).map(x=>[x.total,x.passed,x.fullPass]),[[9,4,false],[10,5,false],[10,5,false],[8,4,false],[10,5,false]]);
  for(const change of [x=>x.models[0].sourceDigest='f'.repeat(64),x=>x.condition='low-32768',x=>x.models[0].items[5].score=2,x=>x.models[0].items[2].score=1,x=>x.models[1].items[1].score=3,x=>x.models[0].items.reverse()]){
    const x=structuredClone(book);change(x);assert.throws(()=>validateDailyScores(x,data,bank));
  }
});
test('pending scores stay pending; a high subtotal cannot hide a failed task',()=>{
  const x=structuredClone(book.models[1]);x.items[0].score=null;
  assert.deepEqual(suiteSummary(x),{total:8,graded:5,passed:4,fullPass:false,complete:false});
  x.items.forEach(i=>i.score=2);assert.equal(suiteSummary(x).fullPass,true);
  x.items[5].score=1;assert.equal(suiteSummary(x).fullPass,false);
});
test('personal stars survive reload and reject foreign batch, malformed or out-of-range entries',()=>{
  let text=null;const storage={getItem:()=>text,setItem:(k,v)=>text=v};const ratings={'kimi-k3':4};
  assert.equal(saveRatings(storage,'key',data,ratings),true);assert.deepEqual(readRatings(storage,'key',data),ratings);
  const stored=JSON.parse(text);stored.ratings['glm53-flash']=10;stored.ratings['not-a-model']=5;stored.ratings['minimax-m31-flash']='5';text=JSON.stringify(stored);
  assert.deepEqual(readRatings(storage,'key',data),ratings);
  stored.batchKey='other';text=JSON.stringify(stored);assert.deepEqual(readRatings(storage,'key',data),{});
  text='{';assert.deepEqual(readRatings(storage,'key',data),{});
  text=JSON.stringify({schemaVersion:1,batchKey:ratingBatchKey(data),ratings:null});assert.deepEqual(readRatings(storage,'key',data),{});
});
test('storage denial preserves honest failure feedback without changing published grades',()=>{
  const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.deepEqual(readRatings(unavailable,'key',data),{});assert.equal(saveRatings(unavailable,'key',data,{'kimi-k3':5}),false);
  const html=suiteScoreboard(data,book,{saved:false});assert.match(html,/星评仅在当前页面有效/);
});
test('scoreboard shows all names, personal ratings and truthful empty pass filter',()=>{
  const original=JSON.stringify(book);const html=publishedHome(data,bank,book,{ratings:{'kimi-k3':5}});
  for(const m of data.models)assert.match(html,new RegExp(m.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal((html.match(/data-suite-model=/g)||[]).length,5);assert.match(html,/我的星评/);assert.match(html,/9<\/strong>/);assert.match(html,/扣1分格式分/);
  assert.match(suiteScoreboard(data,book,{filter:'passed'}),/本批暂无整套通过的模型/);
  const starred=suiteScoreboard(data,book,{filter:'starred',ratings:{'kimi-k3':5}});assert.equal((starred.match(/data-suite-model=/g)||[]).length,1);
  assert.equal(JSON.stringify(book),original);
});
test('answer page scoring matches suite and escapes model-controlled text',()=>{
  const html=publishedTask(data,bank,'honesty',book);assert.match(html,/1 \/ 2 · 部分/);assert.match(html,/扣1分格式分/);
  const x=structuredClone(book);x.models[0].items[0].reason='<img src=x onerror=alert(1)>';
  const out=suiteScoreboard(data,x);assert.match(out,/&lt;img/);assert.doesNotMatch(out,/<img src=x/);
});
