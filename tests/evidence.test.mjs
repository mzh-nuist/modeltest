import test from 'node:test';
import assert from 'node:assert/strict';
import {taskSummary,comparisonWarnings,percentile,speedSummary} from '../dist/evidence.js';
import {speedView} from '../dist/speed-view.js';

const run=(status,grading='not_applicable',duration=100)=>({id:'r',modelId:'a',taskId:'t',status,grading:{status:grading},metrics:{durationMs:duration,outputTps:null,ttftMs:10,ttfaMs:20,charsPerSec:null}});
test('matrix keeps request failure, wrong answer, pending and skipped separate',()=>{
  const runs=[run('success','passed'),run('success','failed'),run('success','pending'),run('timeout'),run('skipped')];
  const s=taskSummary({runs},'a','t');
  assert.deepEqual([s.attempted,s.passed,s.failed,s.pending,s.requestErrors,s.skipped],[4,1,1,1,1,1]);
  assert.equal(s.latest,runs[4]);assert.equal(taskSummary({runs},'b','t').latest,null);
});
test('comparison warns about different graded coverage even with equal sample counts',()=>{
  const a=run('success','passed'),b={...a,modelId:'b',taskId:'other'};
  const warnings=comparisonWarnings({runs:[a,b]},[{id:'a'},{id:'b'}]);
  assert.equal(warnings.length,2);assert.match(warnings[0],/覆盖不同/);
  assert.equal(comparisonWarnings({runs:[]},[]).length,0);
});
test('speed statistics exclude failed latency without hiding failure counts',()=>{
  const a=run('success','passed',100),b=run('success','passed',300),c=run('timeout','not_applicable',60000);
  a.metrics.outputTps=20;
  const s=speedSummary({runs:[a,b,c,run('skipped')]},'a');
  assert.deepEqual([s.attempted,s.success,s.errors,s.timeouts,s.duration,s.p90,s.tps,s.tpsSamples],[3,2,1,1,200,280,20,1]);
  assert.equal(speedSummary({runs:[a]},'a','other').duration,null);
});
test('percentiles exclude unknown values and preserve actual zero',()=>{
  assert.equal(percentile([null,undefined,NaN],.9),null);
  assert.equal(percentile([0,10],.5),5);assert.equal(percentile([8],.9),8);
});
test('speed view escapes imported task and model text',()=>{
  const html=speedView({models:[{id:'a',name:'<img onerror=x>'}],tasks:[{id:'t',title:'<script>x</script>'}],runs:[]});
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
