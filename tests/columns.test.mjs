import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mergeHighExpanded} from '../dist/high-expanded.js';
import {projectHighSuite} from '../dist/high-suite.js';
import {studioHome,studioArchive,studioWorks,studioRepairs,drawingCatalog} from '../dist/studio-home.js';
import {createPublishedDailyController} from '../dist/published-daily.js';
import {trafficRoute} from '../dist/traffic.js';
import {validateTrafficEvent} from '../worker/index.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const bank=read('checkup.json');
const load=()=>projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),bank);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('three columns expose real identities and results without guessing, voting or score mutation',()=>{
  const {data,book}=load(),before=JSON.stringify({data,book});
  const home=studioHome(data,book),works=studioWorks(data,book),repairs=studioRepairs(data,book,bank),scores=studioArchive(data,book);
  for(const label of ['模型测评','整活作品','翻车修复'])assert.ok(home.includes(label));
  assert.equal((home.match(/class="work-card home-work-card"/g)||[]).length,2);
  assert.equal((works.match(/class="work-card"/g)||[]).length,10);
  for(const model of data.models)assert.ok(works.includes(model.name));
  for(const html of [home,works,repairs,scores])assert.doesNotMatch(html,/data-blind|猜猜|投票|先猜|data-suite-star|data-home-warmup|匿名选择/);
  for(const score of [77,80,63,90,72.5])assert.ok(scores.includes('<strong>'+score+'</strong>'));
  assert.equal(JSON.stringify({data,book}),before);
});

test('gallery preserves exact safe SVGs, never substitutes examples or executes model markup',()=>{
  const {data,book}=load(),catalog=drawingCatalog(data,book);
  assert.equal(catalog.zebra.length,5);assert.equal(catalog.visual.length,5);
  for(const entry of [...catalog.zebra,...catalog.visual]){
    const html=studioWorks(data,book,entry.task.id,entry.model.id);
    const encoded=html.match(/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/)[1].replaceAll('&#39;',"'");
    assert.equal(decodeURIComponent(encoded),entry.svg);
    assert.ok(html.includes(escape(entry.item.measurement.output)));
    assert.ok(html.includes(escape(entry.item.reason)));
  }
  const unsafe=structuredClone(book);
  unsafe.models[0].items[7].measurement.output='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  assert.equal(drawingCatalog(data,unsafe).zebra.length,4);
  unsafe.models[1].items[7].measurement.status='error';
  assert.equal(drawingCatalog(data,unsafe).zebra.length,3);
  assert.match(studioWorks(data,book,'zebra','missing'),/没有找到这幅作品/);
  assert.doesNotMatch(studioWorks(data,book,'zebra','<img src=x>'),/<img src=x>/);
});

test('repairs separates uncorrected drawings, exact text editing and unmeasured code repair',()=>{
  const {data,book}=load(),html=studioRepairs(data,book,bank);
  assert.equal((html.match(/class="work-card issue-card"/g)||[]).length,2);
  assert.equal((html.match(/class="edit-result"/g)||[]).length,5);
  assert.equal((html.match(/尚无返工答卷/g)||[]).length,3);
  assert.match(html,/不属于代码修复/);assert.match(html,/还没有代码修 bug 或作品返工记录/);
  for(const model of data.models)for(const output of model.report.runs[2].outputs)assert.ok(html.includes(escape(output)));
  assert.doesNotMatch(html,/修复成功率|修好了|返工成功|机器人/);
});

test('controller supports all column routes and old play links show identified works',async()=>{
  const saved={fetch:globalThis.fetch,location:globalThis.location,storage:globalThis.localStorage};
  try{
    globalThis.location={hash:'#checkup'};globalThis.localStorage={getItem:()=>null};
    globalThis.fetch=async url=>({ok:true,text:async()=>JSON.stringify(read(url.replace('data/','')))});
    let done;const ready=new Promise(resolve=>done=resolve);
    const main={addEventListener(){},querySelectorAll:()=>[]};
    const controller=createPublishedDailyController({main,rerender:()=>done()});
    controller.render();await ready;
    for(const route of [[],['results'],['works'],['works','visual'],['works','zebra','kimi-k3'],['repairs'],['play'],['model','kimi-k3'],['compare']]){
      const html=controller.render(route);
      assert.ok(html.length>100);assert.doesNotMatch(html,/暂时没有读出来|data-blind|data-suite-star|先猜|data-home-warmup/);
    }
    assert.equal(controller.render(['play']),controller.render(['works']));
    for(const id of ['qwen38-max','gpt61-sol']){
      assert.match(controller.render(['model',id]),/没有找到这份答卷/);
      assert.doesNotMatch(controller.render(['compare']),new RegExp(id));
    }
    const current=mergeHighExpanded(load(),read('high-expanded.json'),bank);
    assert.equal((controller.render(['works','visual']).match(/class="work-card"/g)||[]).length,drawingCatalog(current.data,current.book).visual.length);
  }finally{globalThis.fetch=saved.fetch;globalThis.location=saved.location;globalThis.localStorage=saved.storage;}
});

test('new navigation contains three equal labels and analytics accepts only known column routes',()=>{
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const nav=html.match(/<nav aria-label="实测主导航">([\s\S]*?)<\/nav>/)[1];
  assert.equal((nav.match(/<a /g)||[]).length,3);
  assert.doesNotMatch(nav,/play|猜|旧成绩/);
  for(const route of ['results','works','repairs']){
    assert.equal(trafficRoute('#checkup/'+route),'checkup/'+route);
    assert.ok(validateTrafficEvent({eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),kind:'qa',route:'checkup/'+route,source:'direct',device:'desktop'}));
  }
  assert.equal(trafficRoute('#checkup/works/visual/kimi-k3'),'checkup/works');
  assert.equal(trafficRoute('#checkup/play'),'checkup/works');
  assert.equal(trafficRoute('#checkup/works/arbitrary'),null);
});
