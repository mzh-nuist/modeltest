import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {renderCodexComparison, validateCodexComparison} from '../dist/codex-comparison.js';
import {publishCodexMain, publishCodexShort} from '../dist/codex-publication.js';
import {projectHighSuite} from '../dist/high-suite.js';
import {mergeHighExpanded} from '../dist/high-expanded.js';
import {publishedModel, publishedTask} from '../dist/published-daily.js';
import {studioArchive, studioHome, studioRepairs, studioWorks} from '../dist/studio-home.js';
import {studioComparePage} from '../dist/studio-pages.js';
import {shortTaskPage, validateShortResults} from '../dist/short-challenges.js';
import {gradeShort} from '../dist/short-challenge-grading.js';
import {weightedSummary} from '../dist/weighted-score.js';

const read = path => readFileSync(new URL('../dist/' + path, import.meta.url));
const json = name => JSON.parse(read('data/' + name + '.json'));
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

test('Codex results use the normal model, paper and artwork pages without changing the API records', () => {
  const checkup = json('checkup');
  const projected = projectHighSuite(json('high-suite'), json('daily-measured'), json('completed-suite'), checkup);
  const original = mergeHighExpanded(projected, json('high-expanded'), checkup);
  const {data, book} = publishCodexMain(original, evidence, checkup);
  const expected = ['gpt62-sol', 'gpt62-astra'];
  assert.deepEqual(data.models.slice(0, -2), original.data.models);
  assert.deepEqual(book.models.slice(0, -2), original.book.models);
  assert.equal(data.totalRequests, original.data.totalRequests);
  assert.equal(data.codexRequests, 26);
  assert.deepEqual(data.models.slice(-2).map(model => model.id), expected);
  assert.deepEqual(book.models.slice(-2).map(row => weightedSummary(book, row).finalScore), [92.5, 72.5]);
  for (const markup of [studioHome(data, book), studioArchive(data, book),
    studioWorks(data, book), studioRepairs(data, book, checkup),
    publishedTask(data, checkup, 'visual', book)]) {
    for (const id of expected) assert.ok(markup.includes('#checkup/model/' + id));
    assert.match(markup, /Codex High/);
  }
  const detail = publishedModel(data, checkup, 'gpt62-astra', book);
  assert.match(detail, /72\.5/);
  assert.match(detail, /共 2 份/);
  assert.match(detail, /查看完整 5 轮对话/);
  const compare = studioComparePage(data, checkup, book, data.models.at(-2), data.models[0]);
  assert.match(compare, /两边的测试入口与输出设置不同/);
  assert.match(compare, /data-model-id="gpt62-astra"/);
  const changed = structuredClone(evidence);
  changed.cases[0].prompts[0] += '改题';
  assert.throws(() => publishCodexMain(original, changed, checkup), /主试题与站点版本不一致/);
});

test('both short challenge pages expose the additional fair-scored samples in their replay picker', () => {
  const original = validateShortResults(json('short-challenge-results'), bank);
  const merged = publishCodexShort(original, evidence, bank);
  assert.equal(merged.codexCalls, 8);
  assert.equal(merged.modelCalls, original.modelCalls);
  assert.deepEqual(merged.records.slice(0, -8), original.records);
  assert.ok(merged.records.slice(-8).every(record => record.grade.total === 100));
  for (const task of bank.tasks) {
    const html = shortTaskPage(bank, merged, task.id);
    assert.match(html, /option value="gpt62-sol"[^>]*>GPT[^<]+Codex High/);
    assert.match(html, /option value="gpt62-astra"[^>]*>GPT[^<]+Codex High/);
    assert.match(html, /data-short-view="gpt62-sol"/);
    assert.match(html, /服务端上限未知/);
  }
});
