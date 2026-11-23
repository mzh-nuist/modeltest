import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {projectAgentTasks,renderChristmasChallenge,validateChristmasChallenge} from '../dist/christmas-challenge.js';
import {weightedSummary} from '../dist/weighted-score.js';

const read = name => readFileSync(new URL(name,import.meta.url));
const data = validateChristmasChallenge(JSON.parse(read('../dist/data/christmas-cache-v1.json')));

test('Christmas artwork is scored independently and reuses the exact task soundtrack',() => {
  const publicScore = data.runs.find(run => run.name === 'GPT-6.2 Astra');
  assert.equal(publicScore.frontend.score,99);
  assert.equal(publicScore.backend.score,100);
  assert.deepEqual(read('../dist/art/christmas/music.wav'),read('../datasets/christmas_cache_v1/frontend/music.wav'));
  const incomplete = data.runs.find(run => run.name === 'Claude Sonnet 5.5');
  assert.equal(incomplete.backend.score,undefined);
});

test('Christmas previews isolate authored JavaScript and use valid artwork routes',() => {
  const home = renderChristmasChallenge(data);
  assert.equal((home.match(/播放作品/g)||[]).length,data.runs.filter(run => run.frontend.work).length);
  const player = renderChristmasChallenge(data,'astra');
  assert.match(player,/<iframe [^>]*sandbox="allow-scripts"[^>]*src="art\/christmas\/astra\/index.html/);
  assert.doesNotMatch(player,/allow-same-origin/);
  for (const run of data.runs.filter(run => run.frontend.work)) {
    const page = read(`../dist/art/christmas/${run.frontend.work}/index.html`).toString();
    assert.match(page,/Content-Security-Policy/);
    assert.match(page,/src="\.\.\/music\.wav"/);
  }
  const changed = structuredClone(data);
  changed.runs.find(run => run.frontend.work).frontend.work = '../outside';
  assert.throws(()=>validateChristmasChallenge(changed),/成绩不一致/);
});

test('the Grok challenge submission identifies the actual Cursor harness',() => {
  const grok = data.runs.find(run => run.modelId === 'grok47');
  assert.equal(grok.name,'Grok 4.7');
  assert.equal(grok.harness,'Cursor Agent CLI');
  assert.equal(grok.effort,'high');
  assert.equal(grok.frontend.score,97);
  assert.equal(grok.backend.score,100);
  assert.match(renderChristmasChallenge(data,'grok'),/Cursor Agent CLI · High/);
  assert.match(renderChristmasChallenge(data,'grok'),/圣诞树配乐 97 \/ 100/);
  assert.match(renderChristmasChallenge(data,'cache','grok47'),/Grok 4\.7 的并发缓存[\s\S]*100 \/ 100/);
  assert.match(renderChristmasChallenge(data,'cache','claude-sonnet55'),/未完成/);
  assert.match(renderChristmasChallenge(data,'cache','deepseek-v41-flash'),/未找到这份挑战答卷/);
  const duplicate=structuredClone(data);
  duplicate.runs[0].modelId=grok.modelId;
  assert.throws(()=>validateChristmasChallenge(duplicate),/条件不一致/);
});

test('the two replacement slots convert actual high scores and never borrow a sibling model score',() => {
  const ids=['purpose','reasoning','edit','memory','honesty','visual','receipt','zebra'];
  const weights=[10,10,10,10,15,10,20,15];
  const book={
    tasks:ids.map((id,i)=>({id,weight:weights[i]})),
    models:['grok47','kimi-k31-pro','deepseek-v41-flash'].map(modelId=>({
      modelId,selectionFinal:true,items:ids.map(taskId=>({taskId,score:2})),
    })),
  };
  const current=projectAgentTasks(book,data);
  assert.deepEqual(current.tasks.map(task=>task.id),['purpose','christmas','cache','memory','honesty','visual','receipt','zebra']);
  assert.deepEqual(current.tasks.map(task=>task.weight),weights);
  assert.equal(weightedSummary(current,current.models[0]).finalScore,99.7);
  assert.equal(current.models[1].items[1].score,null);
  assert.equal(current.models[1].items[2].score,2);
  assert.equal(weightedSummary(current,current.models[1]).finalScore,null);
  assert.deepEqual(current.models[2].items.slice(1,3).map(item=>item.score),[null,null]);
  assert.deepEqual(book.tasks.map(task=>task.id),ids);
  assert.equal(book.models[0].items[1].score,2);
  assert.equal(weightedSummary(projectAgentTasks(book),projectAgentTasks(book).models[0]).finalScore,null);
});

test('Luna links to both artifacts from the Codex High run',() => {
  const luna=data.runs.find(run=>run.modelId==='gpt6-luna');
  assert.equal(luna.harness,'Codex App Server');
  assert.equal(luna.effort,'high');
  assert.equal(luna.frontend.score,89);
  assert.equal(luna.backend.score,100);
  assert.match(renderChristmasChallenge(data,'luna'),/圣诞树配乐 89 \/ 100/);
  assert.match(renderChristmasChallenge(data,'cache','gpt6-luna'),/100 \/ 100/);
});
