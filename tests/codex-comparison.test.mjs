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

test('GPT-6.1 Terra extends the catalogue as a distinct tier while Sol and Astra remain 6.2 only', () => {
  const checkup = json('checkup');
  const projected = projectHighSuite(json('high-suite'), json('daily-measured'), json('completed-suite'), checkup);
  const historical = mergeHighExpanded(projected, json('high-expanded'), checkup);
  const current = publishCodexMain(historical, evidence, checkup);
  const terra = validateCodexComparison(json('codex-terra-20261118'), ['gpt-6.1-terra']);
  assert.throws(() => validateCodexComparison(terra, ['gpt-6.1-sol']), /数据不完整/);
  const {data, book} = publishCodexMain(current, terra, checkup);
  assert.equal(data.codexRequests, 39);
  assert.equal(data.models.length, 13);
  assert.deepEqual(data.models.filter(model => /gpt.*(?:sol|astra|terra)$/.test(model.id)).map(model => model.id),
    ['gpt62-sol', 'gpt62-astra', 'gpt61-terra']);
  const details = publishedModel(data, checkup, 'gpt61-terra', book);
  assert.match(details, /<strong>99<\/strong>/);
  assert.match(details, /Codex High/);
  const shorts = publishCodexShort(publishCodexShort(json('short-challenge-results'), evidence, bank), terra, bank);
  assert.equal(shorts.codexCalls, 12);
  assert.ok(shorts.records.filter(record => record.modelId === 'gpt61-terra').every(record => record.grade.total === 100));
});

test('Grok shows usable replies but leaves missing delivery unscored and off the ranked list', () => {
  const checkup = json('checkup');
  const projected = projectHighSuite(json('high-suite'), json('daily-measured'), json('completed-suite'), checkup);
  const historical = mergeHighExpanded(projected, json('high-expanded'), checkup);
  const source = json('grok47-high-20261118');
  const visual = source.cases.find(item => item.id === 'visual');
  if (visual.answers[0].followup) visual.answers[0] = {
    modelId:'xai/grok-4.7', score:null, turns:[], status:'unavailable', attempted:1,
    reason:'首轮接口返回流不完整，未交付正文。',
  };
  const grok = validateCodexComparison(source, ['xai/grok-4.7'], 'CommandCode API');
  const {data, book} = publishCodexMain(historical, grok, checkup);
  const row = book.models.at(-1);
  assert.deepEqual([row.items[5].score,row.items[6].score,row.items[7].score], [null,0,13*2/15]);
  assert.equal(weightedSummary(book, row).finalScore, null);
  assert.equal(weightedSummary(book, row).graded, 7);
  assert.equal(weightedSummary(book, row).earned, 68);
  assert.equal(data.totalRequests - historical.data.totalRequests, 13);
  assert.equal(data.successfulRequests - historical.data.successfulRequests, 12);
  const markup = studioArchive(data, book);
  assert.match(markup, /class="pending-model-card" href="#checkup\/model\/grok47"/);
  assert.doesNotMatch(markup, /class="column-model-card" href="#checkup\/model\/grok47"/);
  const details = publishedModel(data, checkup, 'grok47', book);
  assert.match(details, /按字面合计是/);
  assert.match(details, /本次请求未取得完整答卷/);
  assert.match(details, /max_completion_tokens 为 16,384/);
  assert.match(details, /46,281 个输出 token，其中 39,390 个是推理 token/);
  assert.match(studioWorks(data, book, 'zebra', 'grok47'), /class="work-image"/);
  const shorts = json('short-challenge-results');
  const scoredShorts = grok.cases.filter(item => item.suite === 'short' && item.answers[0].score !== null);
  assert.deepEqual(scoredShorts.map(item => item.answers[0].score), [100,100,100,90]);
  const merged = publishCodexShort(shorts, grok, bank);
  assert.deepEqual(merged.records.slice(0, shorts.records.length), shorts.records);
  assert.equal(merged.modelCalls - shorts.modelCalls, scoredShorts.length);
  assert.ok(merged.records.slice(shorts.records.length).every(record => record.collectionLabel === 'Grok 订阅 High'));
});

test('a Grok subscription retest preserves the original request count and identifies its own route', () => {
  const checkup = json('checkup');
  const initial = projectHighSuite(json('high-suite'), json('daily-measured'), json('completed-suite'), checkup);
  const fixture = json('grok47-high-20261118');
  const visual = fixture.cases.find(item => item.id === 'visual');
  visual.answers[0] = {
    modelId:'xai/grok-4.7', score:5, reason:'Synthetic comparison fixture',
    turns:[evidence.cases.find(item => item.id === 'visual').answers[0].turns[0]],
    followup:{route:'Grok subscription Responses', reasoningEffort:'high', maxVisibleOutputTokens:16384, date:fixture.date},
  };
  const batch = validateCodexComparison(fixture, ['xai/grok-4.7'], 'CommandCode API');
  const {data, book} = publishCodexMain(initial, batch, checkup);
  assert.equal(data.totalRequests - initial.data.totalRequests, 14);
  const detail = publishedModel(data, checkup, 'grok47', book);
  assert.match(detail, /High · 含补测/);
  assert.match(detail, /Grok 订阅 · Responses · High · 正文上限 16,384/);
  assert.equal(weightedSummary(book, book.models.at(-1)).finalScore, 73);
});
