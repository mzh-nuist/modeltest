import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scopeData,projectData} from '../dist/scope.js';
import {validateData} from '../dist/lib.js';
import {qualityChart} from '../dist/quality-chart.js';
const document=JSON.parse(fs.readFileSync(new URL('../dist/data/measured.json',import.meta.url),'utf8'));
test('scoped exports retain consistent batch references and exclude unrelated tasks/models',()=>{
  for(const b of document.batches){
    const scoped=validateData(scopeData(document,b.id));
    assert.deepEqual(scoped.batches,[b]);assert.equal(scoped.models.length,b.modelIds.length);
    assert.equal(scoped.tasks.length,b.taskIds.length);assert.ok(scoped.runs.every(r=>r.batchId===b.id));
  }
  assert.equal(scopeData(document,'all'),document);assert.throws(()=>scopeData(document,'missing'));
});
test('quality chart keeps overlapping points readable through escaped numeric legend',()=>{
  const copy=structuredClone(document);copy.models=copy.models.filter(m=>m.maxOutputTokens===1536);copy.models[0].name='<script>fake</script>';
  const html=qualityChart(projectData(copy,{modelIds:copy.models.map(m=>m.id)}));assert.ok(html.includes('&lt;script&gt;fake'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('相同位置的点可能重叠'));assert.ok(html.includes('道已评题'));
});
