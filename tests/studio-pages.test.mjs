import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectHighSuite} from '../dist/high-suite.js';
import {studioModelPage,studioComparePage,readableAnswer,bindAnswerNavigation} from '../dist/studio-pages.js';
import {publishedModel} from '../dist/published-daily.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name,import.meta.url),'utf8'));
const bank=read('checkup.json');
const load=()=>projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),bank);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('model pages preserve all eight scores, original turns and selected comparison identity',()=>{
  const {data,book}=load(),before=JSON.stringify({data,book});
  data.models.forEach((model,k)=>{
    const html=publishedModel(data,bank,model.id,book),expected=[77,80,63,90,72.5][k];
    assert.match(html,new RegExp('<strong>'+expected+'</strong><span>/ 100'));
    assert.equal((html.match(/class="answer-section"/g)||[]).length,8);
    for(const run of model.report.runs)for(const output of run.outputs)if(output)assert.ok(html.includes(escape(output)),'exact original answer must remain accessible');
    for(const id of ['receipt','zebra']){
      const item=book.models[k].items.find(x=>x.taskId===id);
      if(item.measurement?.output)assert.ok(html.includes(escape(item.measurement.output)));
    }
    assert.ok(html.includes('href="#checkup/compare/'+model.id+'/'));
    assert.match(html,/完整 5 轮对话/);assert.doesNotMatch(html,/data-suite-star=/);
  });
  assert.equal(JSON.stringify({data,book}),before);
});

test('comparison aligns eight shared questions and preserves both complete answers',()=>{
  const {data,book}=load(),models=[data.models[4],data.models[2]];
  const html=studioComparePage(data,bank,book,...models);
  assert.equal((html.match(/class="answer-section"/g)||[]).length,8);
  assert.equal((html.match(/class="answer-pane"/g)||[]).length,16);
  assert.equal((html.match(/class="model-picker"/g)||[]).length,2);
  for(const model of models)for(const run of model.report.runs)for(const output of run.outputs)if(output)assert.ok(html.includes(escape(output)));
  assert.match(html,/<strong>72.5<\/strong><span>\/ 100/);assert.match(html,/<strong>63<\/strong><span>\/ 100/);
  assert.match(html,/assets\/receipt-chilli-pork\.png/);
});

test('readable answers support emphasis and tables without executing embedded model content',()=>{
  const html=readableAnswer('**10点15分**\n\n| 任务 | 负责人 |\n|---|---|\n| <img src=x onerror=alert(1)> | 未说明 |\n\n- 不开车\n- 周日晚回');
  assert.match(html,/<strong>10点15分<\/strong>/);assert.match(html,/<table class="answer-table">/);assert.match(html,/<ul><li>不开车/);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script|onerror="/);
});

test('unfinished drawings are not presented as completed artwork, while original output remains available',()=>{
  const {data,book}=load(),model=data.models[0];
  model.report.runs[5].status='error';
  const row=book.models[0];row.items[7].measurement.status='error';
  const html=studioModelPage(data,bank,book,model.id);
  assert.doesNotMatch(html,/<iframe/);assert.match(html,/未交付完整、可预览的图形/);
  assert.ok(html.includes(escape(model.report.runs[5].outputs[0])));
  model.name='<img src=x onerror=alert(1)>';
  assert.doesNotMatch(studioModelPage(data,bank,book,model.id),/<img src=x/);
});

test('answer navigation scrolls and focuses the same-page section with reduced-motion support',()=>{
  let handler,scroll,focus;const attrs={};
  const button={dataset:{answerJump:'memory'},setAttribute:(k,v)=>attrs[k]=v};
  const other={removeAttribute:k=>{attrs.removed=k;}};
  const section={scrollIntoView:options=>scroll=options,focus:options=>focus=options};
  const main={addEventListener:(_,fn)=>handler=fn,contains:el=>el===button,querySelector:s=>s==='#answer-memory'?section:null,querySelectorAll:()=>[button,other],ownerDocument:{defaultView:{matchMedia:()=>({matches:true})}}};
  bindAnswerNavigation(main);handler({target:{closest:()=>button}});
  assert.deepEqual(scroll,{block:'start',behavior:'instant'});assert.deepEqual(focus,{preventScroll:true});assert.equal(attrs['aria-current'],'true');
  assert.equal(attrs.removed,'aria-current');
});
