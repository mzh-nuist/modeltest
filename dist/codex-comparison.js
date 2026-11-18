import {esc as escape} from './lib.js?v=20261101-short1';
import {extractDrawing} from './completed-suite.js?v=20261118-models4';
import {previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
import {arrowRight} from './ui-icons.js?v=20261101-short1';

const evidenceFile = 'data/codex-gpt62-20261118.json';
const terraFile = 'data/codex-terra-20261118.json';
const grokFile = 'data/grok47-high-20261118.json';
const batchPromises = new Map();
const expectedModels = ['gpt-6.2-sol', 'gpt-6.2-astra'];
const expectedCases = [
  ['purpose', 10, 1], ['reasoning', 10, 1], ['edit', 10, 2], ['memory', 10, 5],
  ['honesty', 15, 1], ['visual', 10, 1], ['receipt', 20, 1], ['zebra', 15, 1],
  ['office-1', 100, 1], ['office-2', 100, 1], ['gears-1', 100, 1], ['gears-2', 100, 1],
];
const isText = value => typeof value === 'string' && Boolean(value.trim());
const inRange = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;

export function validateCodexComparison(data, modelIds = expectedModels, route = 'Codex app-server') {
  const invalid = () => { throw new Error('对照数据不完整'); };
  const isCodex = route === 'Codex app-server';
  if (data?.schemaVersion !== (isCodex ? 'codex-comparison-v1' : 'provider-comparison-v1') || data.reasoningEffort !== 'high'
      || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !isText(data.clientVersion)
      || data.route !== route || (isCodex ? data.speed !== 'standard' : data.maxOutputTokens !== 16384)
      || data.models?.length !== modelIds.length || data.cases?.length !== expectedCases.length) invalid();
  modelIds.forEach((id, index) => {
    if (data.models[index]?.id !== id || !isText(data.models[index].name)) invalid();
  });
  expectedCases.forEach(([id, max, turns], index) => {
    const item = data.cases[index];
    const main = index < 8;
    if (item?.id !== id || item.suite !== (main ? 'main' : 'short') || item.maxPoints !== max
        || !isText(item.title) || !Array.isArray(item.prompts) || item.prompts.length !== turns
        || !item.prompts.every(isText) || item.answers?.length !== modelIds.length) invalid();
    modelIds.forEach((modelId, modelIndex) => {
      const answer = item.answers[modelIndex];
      if (!isCodex && answer?.modelId === modelId && ['unavailable', 'not_run'].includes(answer.status)) {
        if (answer.score !== null || !isText(answer.reason) || answer.turns?.length !== 0
            || !Number.isInteger(answer.attempted) || !inRange(answer.attempted, turns)
            || (answer.status === 'not_run') !== (answer.attempted === 0)) invalid();
        return;
      }
      if (answer?.modelId !== modelId || !inRange(answer.score, max) || !Array.isArray(answer.turns)
          || answer.turns.length !== turns || !answer.turns.every(isText)) invalid();
      if (main ? !isText(answer.reason) : !(
        inRange(answer.content, 80) && inRange(answer.format, 10) && inRange(answer.delivery, 10)
        && answer.content + answer.format + answer.delivery === answer.score
      )) invalid();
    });
  });
  return data;
}

const brand = `<span class="model-badge brand-openai" aria-hidden="true"><img src="assets/brands/openai.svg?v=20261101-short1" width="24" height="24" alt=""></span>`;
const modelName = model => `${brand}<span>${escape(model.name)}</span>`;
const title = (caption = '') => `
  <header class="column-heading">
    <p class="column-kicker">同题对照</p>
    <h1>GPT‑6.2 Sol 对上 Astra</h1>
    ${caption ? `<p>${escape(caption)}</p>` : ''}
  </header>`;
const back = `<a class="column-link" href="#checkup/results">查看模型测评 ${arrowRight}</a>`;
const heading = (number, text) => `<div class="column-section-head"><h2><span>${number}</span>${text}</h2></div>`;
const pre = value => `<pre class="column-original">${escape(value)}</pre>`;
const points = (score, max) => `<span class="codex-points"><strong>${score}</strong> / ${max}</span>`;

function drawing(item, model, output) {
  if (!['visual', 'zebra'].includes(item.id)) return '';
  const {svg} = extractDrawing(output);
  if (!previewableCheckupSVG(svg)) return '';
  // Keep model SVG in the browser's image context, never in the page DOM.
  const imageUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return `<figure class="codex-drawing"><img loading="lazy" src="${escape(imageUrl)}"
    alt="${escape(model.name + ' 的' + item.title + '原作')}"></figure>`;
}

function reason(item, answer) {
  return item.suite === 'main' ? escape(answer.reason)
    : `内容 ${answer.content}/80 · 格式 ${answer.format}/10 · 交付 ${answer.delivery}/10`;
}

function caseRow(item, models) {
  return `<details class="panel codex-case">
    <summary><span>${escape(item.title)}</span>
      ${item.answers.map((answer, index) => `<span class="codex-row-score" aria-label="${escape(models[index].name)} 得分 ${answer.score} / ${item.maxPoints}">${points(answer.score, item.maxPoints)}</span>`).join('')}
    </summary>
    <div class="panel-body">
      ${item.id === 'receipt' ? '<a class="column-link" href="assets/receipt-chilli-pork.png">查看题目原图</a>' : ''}
      ${item.prompts.map((prompt, index) => `<section class="codex-turn">
        <h3>${item.prompts.length > 1 ? `第 ${index + 1} 轮提问` : '测试题目'}</h3>
        ${pre(prompt)}
        <div class="codex-grid">${item.answers.map((answer, modelIndex) => {
          const model = models[modelIndex];
          const output = answer.turns[index];
          return `<section class="codex-answer"><h4 class="column-model">${modelName(model)}</h4>
            ${drawing(item, model, output)}
            ${pre(output)}
            ${index === item.prompts.length - 1 ? `<p class="codex-reason">${reason(item, answer)}</p>` : ''}
          </section>`;
        }).join('')}</div>
      </section>`).join('')}
    </div>
  </details>`;
}

export function renderCodexComparison(data) {
  const {models, cases} = data;
  const main = cases.filter(item => item.suite === 'main');
  const short = cases.filter(item => item.suite === 'short');
  const total = index => main.reduce((sum, item) => sum + item.answers[index].score, 0);
  const receipt = main.find(item => item.id === 'receipt');
  return `<div class="column-page codex-comparison">
    ${title('同一套题、同样的 High 档。')}
    <div class="codex-grid">${models.map((model, index) => `<section class="panel codex-score">
      <h2 class="column-model">${modelName(model)}</h2>
      <p>${points(total(index), 100)}</p>
      <span>八题总分</span>
    </section>`).join('')}</div>
    <section class="column-section">
      ${heading('01', '差在这道账单题')}
      <div class="codex-receipt">
        <a href="assets/receipt-chilli-pork.png" class="codex-bill"><img src="assets/receipt-chilli-pork.png"
          width="1320" height="1149" alt="辣椒炒肉账单原图"><span>查看账单原图 ${arrowRight}</span></a>
        <div><h3>辣椒炒肉有几份？</h3>
          <div class="codex-grid">${receipt.answers.map((answer, index) => `<figure class="panel codex-quote">
            <figcaption class="column-model">${modelName(models[index])}</figcaption>
            <blockquote>${escape(answer.turns[0].replaceAll('**', ''))}</blockquote>
            ${points(answer.score, receipt.maxPoints)}
          </figure>`).join('')}</div>
          <p class="column-note">这道整活题按本站约定计分。带短横线的一行按主菜的子项解读，答案为 1 份。</p>
        </div>
      </div>
    </section>
    <section class="column-section">
      ${heading('02', '八题成绩与原答卷')}
      <div class="codex-row-label" aria-hidden="true"><span>测试题</span>${models.map(model => `<span>${escape(model.name)}</span>`).join('')}</div>
      ${main.map(item => caseRow(item, models)).join('')}
    </section>
    <section class="column-section">
      ${heading('03', '短题加赛')}
      <p>推箱子和齿轮题各有两关，每关单独计分。</p>
      <div class="codex-row-label" aria-hidden="true"><span>测试题</span>${models.map(model => `<span>${escape(model.name)}</span>`).join('')}</div>
      ${short.map(item => caseRow(item, models)).join('')}
    </section>
    <details class="column-disclosure">
      <summary>测试设置</summary>
      <p><time datetime="${escape(data.date)}">${escape(data.date)}</time> · Codex Standard · High · 客户端 ${escape(data.clientVersion)}</p>
      <p>每款模型完成 12 个样例、共 17 轮提问。每题独立开启对话，多轮题保留题内上下文。八题按本站权重初评，四关短题用本站 v2 评分器评判。单次作答可看具体表现，稳定性需要重复测试。</p>
      <p>客户端未设置总时限或输出上限，服务端输出上限未知。这批 Codex 答卷独立展示。</p>
      <a class="column-link" href="${evidenceFile}">下载原题、答卷与分数 ${arrowRight}</a>
    </details>
    <p>${back}</p>
  </div>`;
}

export function createCodexComparison(onChange) {
  let state = 'idle';
  let data;
  return () => {
    if (state === 'idle') {
      state = 'loading';
      loadBatch(evidenceFile, expectedModels).then(payload => {
        data = payload;
        state = 'ready';
      }).catch(() => { state = 'error'; }).finally(onChange);
    }
    if (state === 'ready') return renderCodexComparison(data);
    const message = state === 'error' ? '对照答卷暂时无法读取，请刷新页面重试。' : '正在读取对照答卷…';
    return `<div class="column-page">${title(message)}${back}</div>`;
  };
}

function loadBatch(file, modelIds, route) {
  if (!batchPromises.has(file)) batchPromises.set(file, fetch(file).then(response => {
    if (!response.ok) throw new Error('答卷暂时无法读取');
    return response.json();
  }).then(data => ({...validateCodexComparison(data, modelIds, route), file})).catch(error => {
    batchPromises.delete(file);
    throw error;
  }));
  return batchPromises.get(file);
}

export async function loadComparisonBatches() {
  const outcomes = await Promise.allSettled([
    loadBatch(evidenceFile, expectedModels),
    loadBatch(terraFile, ['gpt-6.1-terra']),
    loadBatch(grokFile, ['xai/grok-4.7'], 'CommandCode API'),
  ]);
  return outcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}
