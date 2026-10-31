import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateCheckupBank,validateCheckupReport,newCheckupReport,assessCheckupReport,compareCheckups,importCheckupReport,previewableCheckupSVG,changedCharacters,parseCheckupJSON} from '../dist/checkup-data.js';
import {checkupHome,checkupTask,checkupResults,checkupComparison,checkupSVG} from '../dist/checkup-view.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const bank=validateCheckupBank(read('../dist/data/checkup.json'));
const demo=read('../dist/data/checkup-demo.json');
const clone=value=>structuredClone(value);

test('six-check home has exactly six approachable cards and no percentage score',()=>{
  const html=checkupHome(bank,newCheckupReport(bank));
  assert.equal((html.match(/class="checkup-card"/g)||[]).length,6);
  assert.match(html,/5 项日常检查/);assert.match(html,/可选画图/);
  assert.doesNotMatch(html,/0–100|严格完成|候选高难|pass@1/);
});
test('unreviewed everyday answers never pass from a lucky keyword',()=>{
  const d=newCheckupReport(bank);
  for(const i of [0,1,4,5])Object.assign(d.runs[i],{status:'complete',outputs:['开车 10点15 未说明 <svg/>']});
  const results=assessCheckupReport(d,bank);
  for(const i of [0,1,4,5])assert.equal(results[i].verdict,'review');
});
test('exact edit highlights insertion deletion and punctuation changes',()=>{
  const d=clone(demo.previous);d.runs[2].outputs[1]='好的，'+bank.tasks[2].exactAnswer;
  assert.equal(assessCheckupReport(d,bank)[2].verdict,'missed');
  assert.equal(changedCharacters(bank.tasks[2].exactAnswer,d.runs[2].outputs[1]).changed,'好的，');
  const diff=changedCharacters('带雨伞','带伞');assert.equal(diff.expectedChanged,'雨');
  d.runs[2].outputs[1]='\n'+bank.tasks[2].exactAnswer+' ';
  assert.equal(assessCheckupReport(d,bank)[2].verdict,'normal');
  d.runs[2].outputs[1]='\ufeff'+bank.tasks[2].exactAnswer;
  assert.equal(assessCheckupReport(d,bank)[2].verdict,'normal');
  d.runs[2].outputs[1]='\u0085'+bank.tasks[2].exactAnswer;
  assert.equal(assessCheckupReport(d,bank)[2].verdict,'missed');
});
test('missing memory history and truncated complete-looking text stay unjudged',()=>{
  const d=clone(demo.previous);Object.assign(d.runs[3],{status:'incomplete',review:null});d.runs[3].outputs[0]=null;
  Object.assign(d.runs[2],{status:'incomplete'});
  assert.equal(assessCheckupReport(d,bank)[3].verdict,'review');
  assert.equal(assessCheckupReport(d,bank)[2].verdict,'review');
  d.runs[3].review=demo.previous.runs[3].review;
  assert.throws(()=>validateCheckupReport(d,bank));
});
test('first-turn connection failure remains visible with an empty answer and failure note',()=>{
  const d=newCheckupReport(bank);Object.assign(d.runs[0],{status:'incomplete',note:'第1轮未完成（http_503）。'});
  assert.equal(assessCheckupReport(d,bank)[0].verdict,'review');
  assert.match(checkupResults(bank,d),/需要人看/);
  d.runs[0].note='';assert.throws(()=>validateCheckupReport(d,bank));
});
test('human checklist distinguishes omission core mistake and uncertainty',()=>{
  const d=clone(demo.previous);
  for(const [key,value,verdict] of [['return','no','missed'],['budget','no','wrong'],['people','unsure','review']]){
    d.runs[3].review.answers=Object.fromEntries(bank.tasks[3].checks.map(c=>[c.id,'yes']));
    d.runs[3].review.answers[key]=value;
    assert.equal(assessCheckupReport(d,bank)[3].verdict,verdict);
  }
});
test('import export preserves all actual turns but cannot become measured data',()=>{
  const imported=importCheckupReport(JSON.stringify(demo.previous),bank);
  assert.equal(imported.kind,'imported');assert.deepEqual(imported.runs,demo.previous.runs);
  for(const mutate of [d=>d.kind='measured',d=>d.score=100,d=>d.runs[0].verdict='normal',d=>d.runs[0].status='not_run',d=>d.checkedAt='2026-02-30T12:00:00Z']){
    const d=clone(demo.previous);mutate(d);assert.throws(()=>validateCheckupReport(d,bank));
  }
  assert.throws(()=>parseCheckupJSON('{"kind":"demo","kind":"imported"}'));
  assert.throws(()=>parseCheckupJSON('{"apiKey":"private"}'));
});
test('comparison suppresses change claims when conditions or chronology differ',()=>{
  assert.equal(compareCheckups(demo.previous,demo.current,bank).rows[1].note,'上次正常，这次出现问题。');
  for(const [key,value]of [['conditions',''],['modelLabel','different'],['checkedAt',null],['checkedAt','2026-10-23T12:00:00Z']]){
    const d=clone(demo.current);d[key]=value;const result=compareCheckups(demo.previous,d,bank);
    assert.equal(result.comparable,false);assert.ok(result.rows.every(r=>r.note.includes('先补齐')));
  }
});
test('SVG preview isolates content and never auto-awards visual quality',()=>{
  const safe='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle r="1"/></svg>';
  assert.equal(previewableCheckupSVG(safe),true);
  const html=checkupSVG(safe);assert.match(html,/sandbox=""/);assert.match(html,/Content-Security-Policy/);assert.match(html,/能显示不等于画对/);
  for(const input of ['<svg onload="alert(1)"/>','<svg><foreignObject/></svg>','<svg><use href="https://bad.test/x"/></svg>','<svg><script/></svg>']){
    assert.equal(previewableCheckupSVG(input),false);assert.doesNotMatch(checkupSVG(input),/<iframe/);
  }
});
test('responses model names and notes are escaped in rendered UI',()=>{
  const d=clone(demo.previous);d.modelLabel='<img src=x onerror="alert(1)">';d.runs[0].outputs[0]='</pre><script>alert(1)</script>';
  for(const html of [checkupTask(bank.tasks[0],d.runs[0],d),checkupResults(bank,d),checkupComparison(bank,d,d)]){
    assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;/);
  }
});
test('browser replay and comparison match Python on saved six-check reports',()=>{
  const script="import json;from runner.checkup import load_bank,demos,assess_report,compare_reports;b=load_bank();d=demos(b);print(json.dumps({'old':assess_report(d['previous'],b),'new':assess_report(d['current'],b),'compare':compare_reports(d['previous'],d['current'],b)},ensure_ascii=False))";
  const py=JSON.parse(execFileSync('python',['-X','utf8','-c',script],{encoding:'utf8'}));
  assert.deepEqual(assessCheckupReport(demo.previous,bank),py.old);
  assert.deepEqual(assessCheckupReport(demo.current,bank),py.new);
  assert.deepEqual(compareCheckups(demo.previous,demo.current,bank),py.compare);
});
test('bundled bank matches source and frozen offline cases remain synthetic',()=>{
  assert.deepEqual(bank,read('../datasets/checkup_v1.json'));
  const report=read('../dist/data/checkup-offline.json');
  assert.equal(report.kind,'demo');assert.equal(report.modelApiCalls,0);assert.equal(report.passed,22);
  assert.ok(report.cases.every(c=>c.passed&&c.actual===c.expected));
  const page=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(page,/href="#checkup" data-nav="checkup"/);assert.match(page,/<details id="advanced-nav"/);
});
test('automatic collection sample contains real fixture turns and no invented semantic review',()=>{
  const sample=validateCheckupReport(read('../dist/data/checkup-collected-demo.json'),bank);
  assert.equal(sample.kind,'demo');assert.match(sample.conditions,/没有真实模型API/);
  assert.equal(sample.runs[3].outputs.length,5);assert.equal(sample.runs[2].outputs.length,2);
  assert.ok(sample.runs.every(r=>r.status==='complete'&&r.review===null));
  assert.deepEqual(assessCheckupReport(sample,bank).map(r=>r.verdict),['review','review','normal','review','review','review']);
  assert.match(checkupHome(bank,newCheckupReport(bank)),/看自动采集演示/);
});
