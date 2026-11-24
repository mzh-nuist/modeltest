import {effortBadge} from './thinking-effort.js?v=20261125-effort1';
import {esc as escape} from './lib.js?v=20261101-short1';
import {arrowRight} from './ui-icons.js?v=20261101-short1';

const taskIds = ['02', '03', '04'];
const evidenceFile = 'data/harness-v1.json';
const originalRoutes = ['reasoning', 'edit', 'memory'];

export function validateHarnessEval(data) {
  if (data?.id !== 'harness-v1' || data.effort !== 'high' || !Array.isArray(data.cases)
      || data.cases.map(task => task.id).join() !== taskIds.join()
      || !Array.isArray(data.runs)) throw Error('工程实测数据不完整');
  for (const task of data.cases) {
    if (!task.title || !task.kind || !Array.isArray(task.prompts) || !task.prompts.length
        || !Array.isArray(task.groups)
        || task.groups.some(group => !Array.isArray(group) || !group[0] || !Number.isInteger(group[1]) || group[1] < 1)
        || task.groups.reduce((sum, group) => sum + group[1], 0) !== 100) throw Error('工程题评分标准不完整');
  }
  const keys = new Set();
  for (const run of data.runs) {
    const task = data.cases.find(item => item.id === run.caseId);
    const key = run.model + '/' + run.caseId;
    if (!task || keys.has(key) || run.effort !== 'high' || !run.harness || !run.model
        || !['complete', 'unavailable'].includes(run.status)) throw Error('工程答卷条件不一致');
    if (run.status === 'complete' && (
      run.groups?.length !== task.groups.length
      || run.groups.some((group, i) => group.name !== task.groups[i][0]
        || group.points !== task.groups[i][1] || typeof group.passed !== 'boolean'
        || group.score !== (group.passed ? group.points : 0))
      || run.score !== run.groups.reduce((sum, group) => sum + group.score, 0)
    )) throw Error('工程成绩与评分项不一致');
    keys.add(key);
  }
  return data;
}

function resultRows(runs) {
  if (!runs.length) return '<p>本题暂无已核验答卷。</p>';
  return runs.map(run => `
    <details class="column-disclosure">
      <summary>${escape(run.model)} · ${escape(run.harness)} · ${run.status === 'complete' ? run.score + ' / 100' : '待测'}${effortBadge(run.status === 'complete' ? run.effort : null)}</summary>
      ${run.status === 'complete' ? `<ul>${run.groups.map(group => `<li>${escape(group.name)} · ${group.score} / ${group.points}${group.passed ? ' · 通过' : ' · 未通过'}</li>`).join('')}</ul>`
        : `<p>${escape(run.reason || '尚未完成采集。')}</p>`}
    </details>`).join('');
}

export function renderHarnessEval(data) {
  return `<div class="column-page studio-home" data-harness-eval>
    <header class="column-heading"><p class="column-kicker">Agent 工程练习</p><h1>让模型亲手改代码</h1>
      <p>同一份起始代码，各自请求 High。实际检查文件改动、前端交互和后端行为。<a class="column-link" href="#checkup/agent-challenge">查看圣诞树与并发缓存</a></p></header>
    ${data.cases.map((task, i) => `<section class="column-section">
      <div class="column-section-head"><h2><span>${escape(task.id)}</span>${escape(task.title)}</h2>
        <a class="column-link" href="#checkup/${originalRoutes[i]}">原日常题 ${arrowRight}</a></div>
      <p class="column-note">${escape(task.kind)} · ${task.prompts.length} 轮 · 满分 100</p>
      <details class="column-disclosure"><summary>题面与计分</summary>
        ${task.prompts.map((prompt, index) => `<p><strong>第 ${index+1} 轮</strong> ${escape(prompt)}</p>`).join('')}
        <ul>${task.groups.map(([name, weight]) => `<li>${escape(name)} · ${weight} 分</li>`).join('')}</ul></details>
      ${resultRows(data.runs.filter(run => run.caseId === task.id))}
    </section>`).join('')}
    <p class="column-note">工程题独立计分。不同原生 harness 的工具和调用次数可能不同，结果反映本次模型与工具的组合表现。</p>
  </div>`;
}

export function createHarnessEval(onChange) {
  let state = 'idle';
  let data;
  return () => {
    if (state === 'idle') {
      state = 'loading';
      fetch(evidenceFile).then(response => {
        if (!response.ok) throw Error('工程实测数据未加载');
        return response.json();
      }).then(raw => {
        data = validateHarnessEval(raw);
        state = 'ready';
      }).catch(() => { state = 'error'; }).finally(onChange);
    }
    if (state === 'ready') return renderHarnessEval(data);
    return state === 'error' ? '<p>工程实测暂时无法读取，请刷新重试。</p>' : '<p>正在读取工程实测…</p>';
  };
}
