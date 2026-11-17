import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {renderCodexComparison, validateCodexComparison} from '../dist/codex-comparison.js';
import {gradeShort} from '../dist/short-challenge-grading.js';

const read = path => readFileSync(new URL('../dist/' + path, import.meta.url));
const evidence = validateCodexComparison(JSON.parse(read('data/codex-gpt62-20261118.json')));
const bank = JSON.parse(read('data/short-challenges.json'));

test('Codex comparison pins source files and preserves the 20-point receipt difference', () => {
  for (const [path, digest] of Object.entries(evidence.sourceHashes)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), digest);
  }
  const main = evidence.cases.filter(item => item.suite === 'main');
  assert.equal(main.reduce((sum, item) => sum + item.maxPoints, 0), 100);
  assert.deepEqual(main.find(item => item.id === 'receipt').answers.map(answer => answer.score), [20, 0]);
  assert.deepEqual(evidence.models.map((model, index) => main.reduce(
    (sum, item) => sum + item.answers[index].score, 0,
  )), [92.5, 72.5]);
  assert.equal(evidence.cases.flatMap(item => item.answers.flatMap(answer => answer.turns)).length, 34);
  const truncated = structuredClone(evidence);
  truncated.cases.find(item => item.id === 'memory').answers[0].turns.pop();
  assert.throws(() => validateCodexComparison(truncated), /数据不完整/);
});

test('all four Codex short cases reproduce each published score from the original answer', () => {
  for (const item of evidence.cases.filter(item => item.suite === 'short')) {
    const task = bank.tasks.find(task => task.cases.some(example => example.id === item.id));
    const example = task.cases.find(example => example.id === item.id);
    for (const answer of item.answers) {
      const score = gradeShort(task, example, answer.turns[0]);
      assert.deepEqual([score.content, score.format, score.delivery, score.total],
        [answer.content, answer.format, answer.delivery, 100]);
    }
  }
});

test('the page escapes original answers and only previews safe model SVGs as images', () => {
  const expected = renderCodexComparison(evidence);
  assert.equal((expected.match(/data:image\/svg\+xml/g) || []).length, 4);
  assert.match(expected, /<strong>92\.5<\/strong>/);
  assert.match(expected, /<strong>72\.5<\/strong>/);
  const injected = structuredClone(evidence);
  injected.cases.find(item => item.id === 'visual').answers[0].turns[0] = '<svg onload="alert(1)"></svg>';
  const html = renderCodexComparison(injected);
  assert.equal((html.match(/data:image\/svg\+xml/g) || []).length, 3);
  assert.match(html, /&lt;svg onload=/);
  assert.doesNotMatch(html, /<svg onload=/);
});
