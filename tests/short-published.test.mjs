import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateShortBank,validateShortResults} from '../dist/short-challenges.js';
const bytes=name=>fs.readFileSync(new URL('../dist/'+name,import.meta.url));
const json=name=>JSON.parse(bytes('data/'+name));
const sha=body=>createHash('sha256').update(body).digest('hex');
test('published scores bind the complete forty-request pilot to the two scorer versions',()=>{
  const bank=validateShortBank(json('short-challenges.json')),results=validateShortResults(json('short-challenge-results.json'),bank);
  assert.equal(results.scoreVersion,'short-rubric-v2');assert.equal(results.modelCalls,40);assert.equal(results.successfulRequests,39);
  assert.equal(results.bankSha256,sha(bytes('data/short-challenges.json')));
  assert.equal(results.collectionBankSha256,sha(bytes('data/short-challenges-v1.json')));
  assert.equal(results.graderSha256,sha(bytes('short-challenge-grading.js')));
  assert.equal(results.previousGraderSha256,sha(bytes('short-challenge-engine.js')));
  assert.equal(new Set(results.records.map(r=>r.modelId)).size,10);
});
test('grading correction changes neither prompts, raw answers, source digests nor request counts',()=>{
  const bank=json('short-challenges.json'),oldBank=json('short-challenges-v1.json'),results=json('short-challenge-results.json'),old=json('short-challenge-results-v1.json');
  assert.equal(results.modelCalls,old.modelCalls);
  assert.deepEqual(bank.tasks.flatMap(t=>t.cases.map(c=>c.prompt)),oldBank.tasks.flatMap(t=>t.cases.map(c=>c.prompt)));
  for(const row of results.records){
    const original=old.records.find(r=>r.modelId===row.modelId&&r.caseId===row.caseId);assert.ok(original);
    for(const field of ['output','sourceDigest','status','checkedAt','apiModel'])assert.equal(row[field],original[field]);
    assert.deepEqual(row.previousGrade,original.grade);
  }
});
