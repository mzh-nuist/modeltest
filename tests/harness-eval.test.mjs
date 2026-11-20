import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderHarnessEval, validateHarnessEval} from '../dist/harness-eval.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const bank = read('../datasets/harness_v1/cases.json');
const results = read('../dist/data/harness-v1.json');

test('engineering results use the original task data and cannot silently change the effort or rubric', () => {
  assert.deepEqual(validateHarnessEval(results).cases, bank.cases);
  const changed = structuredClone(results);
  changed.runs[0].effort = 'low';
  assert.throws(() => validateHarnessEval(changed), /条件不一致/);
  const misgraded = structuredClone(results);
  const complete = misgraded.runs.find(run => run.status === 'complete');
  complete.groups[0].score += 1;
  assert.throws(() => validateHarnessEval(misgraded), /评分项不一致/);
});

test('engineering page renders the three independent scores and reaches the original task pages', () => {
  const html = renderHarnessEval(validateHarnessEval(results));
  for (const route of ['reasoning', 'edit', 'memory']) assert.ok(html.includes('#checkup/' + route));
  for (const term of ['原日常题', '满分 100', 'DeepSeek Harness', 'Codex App Server'])
    assert.ok(html.includes(term));
});
