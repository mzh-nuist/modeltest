import {esc as escape} from './lib.js?v=20261101-short1';
import {arrowRight} from './ui-icons.js?v=20261101-short1';
import {effortBadge} from './thinking-effort.js?v=20261125-effort1';

const route = '#checkup/agent-challenge';
const art = 'art/christmas/';
const assetsVersion = '?v=20261124-goat2';
const bounds = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

export function projectAgentTasks(book, evidence) {
  const replacements = [
    {replace:'reasoning', id:'christmas', name:'圣诞树配乐', title:'让圣诞树跟着音乐跳舞',
      key:'frontend', destination:route+'/christmas', prompt:evidence?.frontendPrompt,
      summary:'用代码画一棵圣诞树，让它跟着同一段 19 秒配乐动起来。',
      partial:'按节拍与旋律 45 分、画面 40 分、播放与移动端 15 分核算原分，再除以 10。'},
    {replace:'edit', id:'cache', name:'并发缓存', title:'写一个扛得住并发和过期的缓存',
      key:'backend', destination:route+'/cache', prompt:evidence?.backendPrompt,
      summary:'用 JavaScript 实现缓存，让同一个键的并发请求共享加载，并防止迟到的旧结果覆盖新值。',
      partial:'自动测试按基础 LRU、过期、并发、竞态和故障恢复逐组计分，原分再除以 10。'},
  ];
  const tasks = book.tasks.map(task=>{
    const replacement = replacements.find(entry=>entry.replace===task.id);
    if (!replacement) return task;
    const {id,name,title,key,destination,prompt,summary,partial} = replacement;
    return {id,name,title,weight:task.weight,agentKey:key,destination,summary,prompts:[prompt||summary],
      allowPartial:true,full:'原始评分满分 100，折算得 10 分。',partial,zero:'已取得可计分结果且原始评分为 0。'};
  });
  const byModel = new Map(evidence?.runs.map(run=>[run.modelId,run]));
  const models = book.models.map(row=>{
    const run = byModel.get(row.modelId);
    const items = row.items.map((item,i)=>{
      const task = tasks[i];
      if (!task.agentKey) return item;
      const result = run?.[task.agentKey];
      const score = result?.score;
      const evidenceLink = task.agentKey==='frontend'
        ? (result?.work ? route+'/'+result.work : task.destination)
        : (run ? task.destination+'/'+run.modelId : task.destination);
      const unavailable = result?.note || (!evidence?'暂时无法读取 Agent 成绩。':run?'尚无可评分的完整交付。':'没有此型号的公开 Agent 答卷。');
      return {taskId:task.id,score:score===undefined?null:score/50,agentScore:score,harness:run?.harness,effort:run?.effort,evidenceLink,
        reason:score===undefined?unavailable:`原始评分 ${score} / 100，计入本榜 ${score/10} / 10。`};
    });
    return {...row,items,selectionFinal:items.every(item=>item.score!==null)};
  });
  return {...book,agentTasks:true,tasks,models};
}

export function validateChristmasChallenge(data) {
  if (data?.id !== 'christmas-cache-v1' || !data.frontendPrompt || !data.backendPrompt || !data.runs?.length)
    throw Error('挑战数据不完整');
  const modelIds = new Set();
  const works = new Set();
  for (const run of data.runs) {
    const {frontend,backend} = run;
    if (!run.name || !run.harness || run.effort !== 'high' || typeof run.modelId !== 'string'
        || !/^[a-z0-9-]+$/.test(run.modelId) || modelIds.has(run.modelId) || !frontend || !backend)
      throw Error('挑战答卷条件不一致');
    modelIds.add(run.modelId);
    if (frontend.score !== undefined) {
      const {score,music,visual,utility,work} = frontend;
      if (!bounds(music,45) || !bounds(visual,40) || !bounds(utility,15) || score !== music+visual+utility
          || typeof work !== 'string' || !/^[a-z0-9-]+$/.test(work) || works.has(work))
        throw Error('圣诞树成绩不一致');
      works.add(work);
    } else if (frontend.status !== '未完成' || frontend.work) throw Error('圣诞树状态不一致');
    if (backend.score !== undefined) {
      if (!backend.groups?.length || backend.groups.some(group => !group.title || !bounds(group.points,100)
          || ![0,group.points].includes(group.score)) || backend.groups.reduce((sum,g) => sum+g.points,0) !== 100
          || backend.groups.reduce((sum,g) => sum+g.score,0) !== backend.score) throw Error('后端成绩不一致');
    } else if (backend.status !== '未完成') throw Error('后端状态不一致');
  }
  return data;
}

function cacheBreakdown(run) {
  const check = run.backend;
  return `<p class="column-note">${escape(run.harness)}</p>
    ${check.groups ? `<ul>${check.groups.map(group => `<li>${escape(group.title)} · ${group.score} / ${group.points}</li>`).join('')}</ul>` : ''}
    ${check.note ? `<p>${escape(check.note)}</p>` : ''}`;
}

function scoreDetails(run) {
  const {score} = run.backend;
  return `<details class="column-disclosure"><summary><span>${escape(run.name)}${effortBadge(run.effort)}</span><strong>${score ?? '未完成'}${score === undefined ? '' : ' / 100'}</strong></summary>
    ${cacheBreakdown(run)}<a class="column-link" href="${route}/cache/${run.modelId}">打开并发缓存答卷 ${arrowRight}</a></details>`;
}

function cachePage(data, run) {
  const {score} = run.backend;
  return `<div class="column-page studio-home christmas-challenge"><header class="column-heading">
    <a class="column-link" href="${route}">← 圣诞树与并发缓存</a><h1>${escape(run.name)} 的并发缓存</h1>
    <p><strong>${score === undefined ? '未完成' : score+' / 100'}</strong></p>${effortBadge(run.effort)}</header>
    <section class="column-section"><h2>测试结果</h2>${cacheBreakdown(run)}
    <details class="column-disclosure"><summary>后端题面与计分</summary><p class="christmas-prompt">${escape(data.backendPrompt)}</p></details></section></div>`;
}

function cover(run) {
  const {score,work} = run.frontend;
  return `<a class="christmas-work" href="${route}/${work}">
    <div class="christmas-thumbnail"><img src="${art+work}.webp${assetsVersion}" alt="${escape(run.name)} 画的圣诞树" decoding="async" width="760" height="570"></div>
    <span class="christmas-work-body"><span><strong>${escape(run.name)}</strong>${effortBadge(run.effort)}</span><span class="christmas-score">${score}<small> / 100</small></span></span>
    <span class="christmas-play-label">播放作品 ${arrowRight}</span></a>`;
}

function player(run) {
  const {work,music,visual,utility,comment} = run.frontend;
  return `<div class="column-page studio-home christmas-challenge"><header class="column-heading">
    <a class="column-link" href="${route}">← 圣诞树与并发缓存</a><h1>${escape(run.name)} 的圣诞树</h1>
    <p>点作品里的播放按钮，听听树怎么跟上铃声。</p><p><strong>圣诞树配乐 ${run.frontend.score} / 100</strong></p>${effortBadge(run.effort)}</header>
    <iframe class="christmas-player" title="${escape(run.name)} 的可播放圣诞树" sandbox="allow-scripts" src="${art+work}/index.html${assetsVersion}"></iframe>
    <dl class="christmas-breakdown"><div><dt>节拍与旋律</dt><dd>${music} <small>/ 45</small></dd></div><div><dt>画面</dt><dd>${visual} <small>/ 40</small></dd></div>
    <div><dt>播放与移动端</dt><dd>${utility} <small>/ 15</small></dd></div></dl>
    <p class="column-note">${escape(comment)}</p><p class="column-note">${escape(run.harness)}</p></div>`;
}

export function renderChristmasChallenge(data, selected, modelId) {
  const runs = data.runs;
  const pieces = runs.filter(run => run.frontend.work);
  if (selected === 'cache') {
    const run = runs.find(row => row.modelId === modelId);
    if (run) return cachePage(data,run);
  }
  const found = selected && pieces.find(run => run.frontend.work === selected);
  if (found) return player(found);
  if (selected && selected!=='christmas' && !(selected==='cache'&&!modelId)) return `<div class="column-page studio-home christmas-challenge"><header class="column-heading">
    <a class="column-link" href="${route}">← 圣诞树与并发缓存</a><h1>未找到这份挑战答卷</h1></header></div>`;
  return `<div class="column-page studio-home christmas-challenge"><header class="column-heading">
    <a class="column-link" href="#checkup/results">← 八题实测榜</a>
    <h1>${selected==='cache'?'并发缓存':`一段配乐，${pieces.length} 棵圣诞树`}</h1>
    <p>这里展示原始百分制成绩，两题各折算为 10 分计入八题实测榜。</p></header>
    ${selected==='cache'?'':`<section class="column-section"><div class="column-section-head"><h2>圣诞树跟着音乐跳舞</h2></div>
    <div class="christmas-works">${pieces.slice().sort((a,b) => b.frontend.score-a.frontend.score).map(cover).join('')}</div>
    <details class="column-disclosure"><summary>前端题面与计分</summary><p class="christmas-prompt">${escape(data.frontendPrompt)}</p></details></section>`}
    ${selected==='christmas'?'':`<section class="column-section"><div class="column-section-head"><h2>并发缓存怎么扛</h2></div>
    <p class="column-note">独立脚本检查同键合并、过期刷新和旧请求回写。点模型看各项得分。</p>
    ${runs.slice().sort((a,b) => (b.backend.score ?? -1)-(a.backend.score ?? -1)).map(scoreDetails).join('')}
    <details class="column-disclosure"><summary>后端题面与计分</summary><p class="christmas-prompt">${escape(data.backendPrompt)}</p></details></section>`}</div>`;
}

export function createChristmasChallenge(onChange) {
  let state = 'idle';
  let data;
  let loading;
  function load() {
    if (state === 'idle') {
      state = 'loading';
      loading = fetch('data/christmas-cache-v1.json'+assetsVersion).then(response => {
        if (!response.ok) throw Error('成绩下载失败');
        return response.json();
      }).then(raw => { data = validateChristmasChallenge(raw); state = 'ready'; })
        .catch(() => { state = 'error'; }).finally(onChange);
    }
    return loading;
  }
  return {
    async evidence() {
      await load();
      return data;
    },
    render(selected, modelId) {
      load();
      if (state === 'ready') return renderChristmasChallenge(data,selected,modelId);
      return state === 'error' ? '<p>挑战成绩暂时无法读取，请刷新重试。</p>' : '<p>正在加载挑战成绩…</p>';
    },
    forModel(modelId) {
      load();
      return data?.runs.find(run => run.modelId === modelId);
    },
  };
}
