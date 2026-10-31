import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePublishedDaily,publishedHome,publishedTask,publishedModel,supplementalPicture} from '../dist/published-daily.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const bank=read('../dist/data/checkup.json'),data=read('../dist/data/daily-measured.json');

test('published real collection has separate provenance and no fabricated human reviews',()=>{
  assert.equal(validatePublishedDaily(data,bank),data);assert.equal(data.totalRequests,60);assert.equal(data.successfulRequests,54);
  assert.ok(data.models.every(m=>m.report.kind==='imported'&&m.report.runs.every(r=>r.review===null)));
  assert.doesNotMatch(JSON.stringify(data),/"(?:monthlyCredits|purchasedCredits|freeCredits|totalUsd|apiKey|authorization|raw|reasoningOutput)"/i);
});
test('visitor home leads to existing answers instead of empty result or entry forms',()=>{
  const html=publishedHome(data,bank);
  for(const m of data.models)assert.ok(html.includes(m.name)&&html.includes('#checkup/model/'+m.id));
  assert.match(html,/60 次请求/);assert.match(html,/GLM 洗车回答前后矛盾/);
  assert.equal((html.match(/class="checkup-card"/g)||[]).length,6);
  assert.doesNotMatch(html,/<textarea|data-ck-check|data-ck-output|看看这次的回答|需要你.*填写/);
});
test('old reasoning deep link displays five actual answers before reference criteria',()=>{
  const html=publishedTask(data,bank,'reasoning');
  for(const m of data.models)assert.ok(html.includes(m.name));
  assert.ok(html.indexOf(data.models[0].name)<html.indexOf('这项怎么看'));
  assert.match(html,/10:15|10点15/);assert.doesNotMatch(html,/<textarea|<select|这些是人工确认/);
  assert.match(html,/助手初审/);
});
test('model view preserves every actual memory turn and keeps default versus supplement separate',()=>{
  const html=publishedModel(data,bank,data.models[0].id);
  assert.match(html,/完整 5 轮对话/);assert.match(html,/本轮没有正文回答|首轮默认档/);
  assert.match(html,/32768/);assert.match(html,/8192/);assert.match(html,/代码围栏/);
});
test('timeout partial SVG remains unrendered and fencing exception remains visible',()=>{
  const partial=supplementalPicture(data.models[1]);assert.match(partial,/180 秒内未完整交付/);assert.doesNotMatch(partial,/<iframe/);
  const fenced=supplementalPicture(data.models[0]);assert.match(fenced,/格式问题仍保留/);assert.match(fenced,/sandbox=""/);
});
test('publisher validator rejects forged source, fake counts, user confirmation and edited exact answer',()=>{
  const mutate=fn=>{const x=structuredClone(data);fn(x);assert.throws(()=>validatePublishedDaily(x,bank));};
  mutate(x=>x.origin='user-upload');mutate(x=>x.totalRequests++);mutate(x=>x.models[0].report.kind='demo');
  mutate(x=>x.models[0].report.runs[0].review={answers:{'bring-car':'yes','explain-purpose':'yes'},note:''});
  mutate(x=>x.models[0].report.runs[2].outputs[1]+='好的');mutate(x=>x.models[0].checks[5].label='主要内容通过');
  mutate(x=>x.monthlyCredits=123);
});
test('model-controlled text is escaped in published cards and answer pages',()=>{
  const x=structuredClone(data);x.models[0].name='<img src=x onerror=alert(1)>';x.models[0].report.runs[0].outputs[0]='<script>danger()</script>';
  validatePublishedDaily(x,bank);const html=publishedTask(x,bank,'purpose');assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img src=x/);
});
