import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gradeShort} from '../dist/short-challenge-grading.js';
const bank=JSON.parse(fs.readFileSync(new URL('../dist/data/short-challenges.json',import.meta.url),'utf8')),task=bank.tasks[1],example=task.cases[0];
test('correct gear content is independent of surrounding prose and pair representation',()=>{
  const prose='```json\n{"can":false,"cut":["BC"]}\n```\n解释：两个奇环共用这条边。';
  assert.deepEqual([gradeShort(task,example,prose).content,gradeShort(task,example,prose).format],[80,0]);
  assert.equal(gradeShort(task,example,'{"can":false,"cut":[["C","B"]]}').total,100);
  assert.equal(gradeShort(task,example,'```json\n{"can":false,"cut":[["B","C"]]}\n```').total,90);
});
test('v2 extraction never chooses the best among competing objects and rejects duplicate keys',()=>{
  for(const output of ['{"can":false,"cut":["BC"]}\n{"can":false,"cut":["AB"]}', '{"can":true,"can":false,"cut":["BC"]}', '{"can":false,"cut":[["B","C"],["C","B"]]}'])assert.ok(gradeShort(task,example,output).content<80);
});
test('a uniquely bolded move line retains content credit and loses format credit',()=>{
  const t=bank.tasks[0],c=t.cases[0],output='**'+c.reference+'**\n步骤说明。';
  const g=gradeShort(t,c,output);assert.equal(g.content,80);assert.equal(g.format,0);assert.equal(g.total,90);
  assert.equal(gradeShort(t,c,'**'+c.reference+'**\nUU').content,0);
});
