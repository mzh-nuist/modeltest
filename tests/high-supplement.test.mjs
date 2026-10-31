import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectHighSuite} from '../dist/high-suite.js';
import {mergeHighSupplement,validateHighSupplement} from './fixtures/high-supplement.mjs';
import {studioHome,studioArchive,studioScores,studioRepairs,drawingCatalog} from '../dist/studio-home.js';
import {studioModelPage,studioComparePage} from '../dist/studio-pages.js';
import {weightedSummary} from '../dist/weighted-score.js';
import {modelBadge} from '../dist/model-identity.js';
import {trafficRoute} from '../dist/traffic.js';
import {validateTrafficEvent} from '../worker/index.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const bank=read('checkup.json'),supplement=JSON.parse(fs.readFileSync(new URL('./fixtures/high-supplement.json',import.meta.url),'utf8'));
const load=()=>projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),bank);

test('supplement keeps three untested models out of scores and preserves original five responses',()=>{
 const base=load(),before=structuredClone(base),{data,book}=mergeHighSupplement(base,supplement,bank);
 assert.deepEqual(base,before);assert.deepEqual(data.models.slice(0,5),base.data.models);assert.deepEqual(book.models.slice(0,5),base.book.models);
 assert.equal(data.models.length,8);assert.equal(data.totalRequests,base.data.totalRequests);
 assert.equal(supplement.totalRequests,0);assert.equal(supplement.successfulRequests,0);
 for(const row of book.models.slice(5)){assert.ok(row.items.every(x=>x.score===null));assert.equal(weightedSummary(book,row).finalScore,null);}
 const home=studioHome(data,book),archive=studioArchive(data,book),table=studioScores(data,book);
 assert.equal((home.match(/class="column-model-card"/g)||[]).length,5);
 assert.equal((home.match(/class="pending-model-card"/g)||[]).length,3);
 assert.match(archive,/5 款已测 · 3 款待测/);
 for(const model of data.models.slice(5)){assert.ok(home.includes(model.name));assert.ok(!table.includes(model.name));assert.match(modelBadge(model.id),/<img /);}
 assert.equal(drawingCatalog(data,book).visual.length,5);assert.equal(drawingCatalog(data,book).zebra.length,5);
 assert.equal((studioRepairs(data,book,bank).match(/class="edit-result"/g)||[]).length,5);
});

test('home gives immediate navigation and a same-task contrast without changing original drawings',()=>{
 const {data,book}=load(),html=studioHome(data,book),firstArt=html.indexOf('class="home-art-grid"');
 assert.ok(html.indexOf('class="home-quick-links"')<firstArt);
 const feature=html.slice(firstArt,html.indexOf('class="column-section home-models"'));
 assert.match(feature,/DeepSeek V4.1 Flash/);assert.match(feature,/Kimi K3/);
 assert.match(feature,/works\/visual\/deepseek-v41-flash/);assert.match(feature,/works\/visual\/kimi-k3/);
 assert.doesNotMatch(feature,/works\/zebra/);assert.match(feature,/<strong>10<\/strong> \/ 10/);assert.match(feature,/<strong>5<\/strong> \/ 10/);
 const repairs=studioRepairs(data,book,bank);
 assert.match(repairs,/data-repair-jump="repair-scenes"/);assert.match(repairs,/id="repair-edits" tabindex="-1"/);
 assert.doesNotMatch(repairs,/href="#repair-/);
});

test('pending details and comparison show no invented zero, generated answer or failed delivery',()=>{
 const {data,book}=mergeHighSupplement(load(),supplement,bank);
 for(const model of data.models.slice(5)){
  const html=studioModelPage(data,bank,book,model.id);
  assert.match(html,/<strong>待测<\/strong>/);assert.ok(html.includes(model.pendingReason));
  assert.equal((html.match(/class="answer-section"/g)||[]).length,8);
  assert.doesNotMatch(html,/模型原回答 · AI 生成|未交付完整|判分依据 · 助手初评|<strong>0<\/strong>/);
  const compare=studioComparePage(data,bank,book,model,data.models[0]);
  assert.match(compare,/<strong>待测<\/strong>/);assert.match(compare,/<strong>77<\/strong>/);
  const available=model.id==='claude-sonnet55';
  assert.equal(trafficRoute('#checkup/model/'+model.id),available?'checkup/model/'+model.id:null);
  assert.equal(Boolean(validateTrafficEvent({eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),kind:'qa',route:'checkup/model/'+model.id,source:'direct',device:'desktop'})),available);
 }
});

test('supplement rejects fabricated scores, tier substitutions, wrong image and private fields',()=>{
 const base=load();const reject=fn=>{const x=structuredClone(supplement);fn(x);assert.throws(()=>validateHighSupplement(x,base.book,bank));};
 reject(x=>x.models[0].items[0].score=2);
 reject(x=>x.models[1].items[0].score=0);
 reject(x=>x.models[1].items[0].measurement.effort='medium');
 reject(x=>x.models[0].effort='xhigh');
 reject(x=>x.models[1].items[6].measurement.imageSha256='a'.repeat(64));
 reject(x=>x.models[1].items[0].measurement.outputs=['invented']);
 reject(x=>x.models[1].items[0].measurement.apiModel='other');
 reject(x=>x.models[1].items[0].measurement.status='success');
 reject(x=>x.models[1].items[0].measurement.maxOutputTokens=999999);
 reject(x=>x.models[1].totalUsd=1);
 reject(x=>x.totalRequests=1);
 reject(x=>x.tasks[0].weight=20);
});
