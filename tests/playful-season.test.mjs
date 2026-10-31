import {previewableCheckupSVG} from '../dist/checkup-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePlayfulSeason,seasonPage,seasonTeaser,bindSeason,historicalReading} from '../dist/playful-season.js';
import {projectHighSuite} from '../dist/high-suite.js';
import {studioHome,studioArchive} from '../dist/studio-home.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const bank=read('playful-season.json');
const load=()=>projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),read('checkup.json'));

test('public development bank has separate versions, six unmeasured tasks and no model result',()=>{
  assert.equal(validatePlayfulSeason(bank),bank);
  assert.equal(bank.protocol.aggregateScore,null);
  for(const mutation of [b=>b.results.push({score:100}),b=>b.modelCalls=1,b=>b.tasks[0].status='measured',b=>b.tasks[0].criteria[0].max++,b=>b.tasks[4].reference.artifact='https://evil.test/pixel.svg']){
    const b=structuredClone(bank);mutation(b);assert.throws(()=>validatePlayfulSeason(b));
  }
  assert.equal(bank.tasks[2].prompts.length,3);
  assert.ok(bank.tasks.every(t=>t.criteria.every(c=>c.full&&c.partial&&c.zero)&&t.gates.length>0));
});

test('new route exposes prompts and rubric but never fabricates model grades or identities',()=>{
  const html=seasonPage(bank);
  assert.equal((html.match(/class="season-task(?: [^"]*)?"/g)||[]).length,6);
  assert.match(html,/内容80 \/ 格式10 \/ 交付10/);assert.match(html,/待实测/);
  assert.match(html,/公开开发题/);assert.match(html,/参考解 · 不是模型答卷/);
  assert.doesNotMatch(html,/第一名|获胜模型|总分排名|模型得分|data-suite-star/);
  for(const model of read('high-suite.json').models)assert.ok(!html.includes(model.name));
  assert.equal((html.match(/data-season-copy=/g)||[]).length,8);
  const detail=seasonPage(bank,'monster-flat');
  assert.equal((detail.match(/class="season-task(?: [^"]*)?"/g)||[]).length,1);assert.match(detail,/第 3 轮/);
  assert.match(seasonPage(bank,'unknown'),/没有这道新题/);
});

test('reference and prompt text remain inert and no arbitrary reference asset can be embedded',()=>{
  const b=structuredClone(bank);b.tasks[0].title='<script>alert(1)</script>';b.tasks[0].prompts[0]='<img src=x onerror=alert(1)>';
  const html=seasonPage(b);assert.match(html,/&lt;script/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script|<img src=x/);
});

test('home reuses measured work and scores while development questions remain separate',()=>{
  const {data,book}=load(),before=JSON.stringify({data,book});
  const html=studioHome(data,book,{season:bank});
  assert.match(html,/整活作品/);assert.match(html,/模型测评/);assert.match(html,/翻车修复/);
  assert.doesNotMatch(html,/data-blind|season-teaser|data-home-warmup/);
  assert.equal(JSON.stringify({data,book}),before);
  assert.equal((studioArchive(data,book).match(/class="question-row"/g)||[]).length,8);
});

test('historical reading distinguishes formatting from facts without changing numeric grades',()=>{
  const {book}=load(),row=book.models.find(m=>m.modelId==='minimax-m31-flash');
  const item=row.items.find(i=>i.taskId==='honesty'),before=JSON.stringify(item);
  const html=historicalReading(book.tasks.find(t=>t.id==='honesty'),item);
  assert.match(html,/未编造事实/);assert.match(html,/用词未按要求/);assert.match(html,/未重新评分/);
  assert.equal(JSON.stringify(item),before);assert.equal(item.score,1);
});

test('copy button copies exactly one requested turn and handles clipboard rejection',async()=>{
  const handlers=[],status={textContent:''};
  const main={addEventListener:(n,f)=>handlers.push(f),contains:()=>true,querySelector:()=>status};
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async s=>{copied=s;}}}});
  try{
    bindSeason(main,()=>bank);
    const event={target:{closest:()=>({dataset:{seasonCopy:'monster-flat',promptIndex:'1'}})}};
    await handlers[0](event);assert.equal(copied,bank.tasks[2].prompts[1]);assert.match(status.textContent,/已复制/);
    navigator.clipboard.writeText=async()=>{throw Error('blocked');};
    await handlers[0](event);assert.match(status.textContent,/手动选择/);
  }finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});

test('all original public data files remain byte-for-byte identical to the pre-edit snapshot',()=>{
  const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-public-data-sha256.json',import.meta.url),'utf8'));
  for(const [name,hash] of Object.entries(baseline).filter(([name])=>name.startsWith('dist/data/'))){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+name,import.meta.url))).digest('hex'),hash,name);
  }
});

test('dynamic task adds a new version while preserving the original five development questions',()=>{
  const previous=JSON.parse(fs.readFileSync(new URL('./fixtures/playful-season-v1.json',import.meta.url),'utf8'));
  assert.deepEqual(bank.tasks.slice(0,5),previous.tasks);
  assert.notEqual(bank.suiteId,previous.suiteId);assert.notEqual(bank.scoreVersion,previous.scoreVersion);
  assert.equal(bank.tasks[5].scoreVersion,'dynamic-pelican-v1');
  for(const change of [b=>b.tasks[5].observation.totalFrames=0,b=>b.tasks[5].observation.cycles=1,b=>b.tasks[5].observation.boundarySeconds=[0,2],b=>b.tasks[5].scoreVersion='static-v1',b=>b.tasks[5].responseFormat='html']){
    const modified=structuredClone(bank);change(modified);assert.throws(()=>validatePlayfulSeason(modified));
  }
});

test('dynamic details expose observation gates, exact prompt copy, and retained old score links',async()=>{
  const dynamic=bank.tasks[5],html=seasonPage(bank,'dynamic-pelican');
  assert.equal((html.match(/class="season-task(?: [^"]*)?"/g)||[]).length,1);
  for(const text of ['36 个观察帧','3 个完整周期','180度','animateTransform','内容80 / 格式10 / 交付10','模型结果：待实测','出题方参考解 · 不是模型答卷'])assert.ok(html.includes(text),text);
  assert.match(html,/href="#checkup\/results"/);assert.doesNotMatch(html,/<iframe|<animate|模型得分/);
  const handlers=[],status={textContent:''},main={addEventListener:(n,f)=>handlers.push(f),contains:()=>true,querySelector:()=>status};
  let copied;const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async x=>{copied=x;}}}});
  try{bindSeason(main,()=>bank);await handlers[0]({target:{closest:()=>({dataset:{seasonCopy:'dynamic-pelican',promptIndex:'0'}})}});assert.equal(copied,dynamic.prompts[0]);}finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
  const {data,book}=load();
  assert.match(studioHome(data,book),/href="#checkup\/season\/dynamic-pelican"/);
  assert.match(studioArchive(data,book),/href="#checkup\/season\/dynamic-pelican"/);
});

test('animated task instructions do not loosen the historical static SVG preview',()=>{
  for(const tag of ['animate','animateTransform'])assert.equal(previewableCheckupSVG('<svg xmlns="http://www.w3.org/2000/svg"><'+tag+' attributeName="opacity" values="0;1" dur="2s" repeatCount="indefinite"/></svg>'),false);
  const changed=structuredClone(bank);changed.tasks[5].reference.answer='<svg><animate onbegin="alert(1)"/></svg>';
  const html=seasonPage(changed,'dynamic-pelican');assert.match(html,/&lt;animate/);assert.doesNotMatch(html,/<animate/);
});
