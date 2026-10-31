import {dynamicChallengePage} from './dynamic-challenge-page.js?v=20261031-player6';
import {bindPelicanPlayer} from './pelican-player.js?v=20261031-player6';
import {arrowRight,arrowUpRight} from './ui-icons.js?v=20261031-player6';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IDS=['werewolf-rota','robot-repair','monster-flat','alien-minutes','octopus-move','dynamic-pelican'];

export function validatePlayfulSeason(bank){
  const fail=()=>{throw Error('新一期题面或评分版本不符合约定');};
  if(bank?.schemaVersion!=='playful-development-v1'||bank.suiteId!=='zhufeng-playful-season-20261031-v2'||bank.scoreVersion!=='playful-rubric-v2'||bank.status!=='unmeasured'||bank.publication!=='public-development-set'||bank.modelCalls!==0||bank.results?.length!==0||bank.protocol?.aggregateScore!==null||bank.tasks?.length!==6)fail();
  if(bank.protocol.content!==80||bank.protocol.format!==10||bank.protocol.delivery!==10)fail();
  bank.tasks.forEach((task,i)=>{
    if(task.id!==IDS[i]||task.status!=='unmeasured'||task.origin!=='original-adaptation'||task.maxScore!==100||!task.prompts?.length||task.prompts.some(p=>typeof p!=='string'||!p.trim())||!task.reference||typeof task.reference.explanation!=='string'||!task.gates?.length)fail();
    for(const key of ['title','hook','ability','replaces'])if(typeof task[key]!=='string'||!task[key].trim())fail();
    if(!Array.isArray(task.criteria)||task.criteria.some(c=>!['content','format','delivery'].includes(c.dimension)||!Number.isInteger(c.max)||c.max<1||['label','full','partial','zero'].some(k=>typeof c[k]!=='string'||!c[k].trim())))fail();
    for(const [kind,max] of Object.entries({content:80,format:10,delivery:10}))if(task.criteria.filter(c=>c.dimension===kind).reduce((n,c)=>n+c.max,0)!==max)fail();
    if(task.id==='dynamic-pelican'){
      const o=task.observation;
      if(task.scoreVersion!=='dynamic-pelican-v1'||task.responseFormat!=='animated-svg-only'||o?.periodSeconds!==2||o.cycles!==3||o.samplesPerCycle!==12||o.totalFrames!==36||JSON.stringify(o.boundarySeconds)!=='[0,2,4,6]'||typeof o.note!=='string'||!o.note.trim())fail();
    }
    if(task.reference.artifact&&task.reference.artifact!=='assets/octopus-reference.svg')fail();
  });
  return bank;
}

export function seasonTeaser(bank){
  const tasks=bank?.tasks||[];
  return `<section class="season-teaser" aria-label="新一期整活挑战"><div class="season-section-head"><div><p class="season-eyebrow">下一轮 / 题面与评分已备好</p><h2>这次，给 AI 出点怪题。</h2></div><span class="season-status">待实测</span></div><p class="season-muted">先看怎么玩、怎么判。还没有模型答卷，也没有新排名。</p><div class="season-teaser-grid">${tasks.map((t,i)=>`<a href="#checkup/season/${e(t.id)}"><span>0${i+1}</span><h3>${e(t.title)}</h3><p>${e(t.ability)}</p><b>看题目 ${arrowUpRight}</b></a>`).join('')}</div><a class="season-link" href="#checkup/season">查看新一期题面与评分 ${arrowRight}</a></section>`;
}

function criteriaMarkup(task){return task.criteria.map(c=>`<section class="season-criterion"><div><h4>${e(c.label)}</h4><span>${c.max}分 · ${{content:'内容',format:'格式',delivery:'交付'}[c.dimension]}</span></div><dl><dt>满分条件</dt><dd>${e(c.full)}</dd><dt>部分得分</dt><dd>${e(c.partial)}</dd><dt>零分条件</dt><dd>${e(c.zero)}</dd></dl></section>`).join('');}

function taskArticle(task,index,bank){
  const ref=task.reference,answer=typeof ref.answer==='string'?ref.answer:JSON.stringify(ref.answer,null,2);
  const sections=criteriaMarkup(task);
  return `<article class="season-task" id="season-${e(task.id)}"><header><p class="season-eyebrow">题目 0${index+1} / 原创改编 · 未实测</p><h2>${e(task.title)}</h2><p class="season-hook">${e(task.hook)}</p><dl class="season-task-meta"><div><dt>测什么</dt><dd>${e(task.ability)}</dd></div><div><dt>承接旧题</dt><dd>${e(task.replaces)}</dd></div><div><dt>当前状态</dt><dd>题面已定义，区分度待校准</dd></div></dl></header><div class="season-task-body"><section><h3>给模型的题面</h3>${task.prompts.map((prompt,j)=>`<div class="season-prompt"><div><h4>${task.prompts.length>1?'第 '+(j+1)+' 轮':'单轮提问'}</h4><button type="button" data-season-copy="${e(task.id)}" data-prompt-index="${j}">复制本轮题面</button></div><pre>${e(prompt)}</pre></div>`).join('')}<p class="season-muted">${task.prompts.length>1?'各轮按顺序发在同一会话，保留模型的实际回答；不要把参考解放进对话。':'题面可复制到模型中；本站当前不会代发请求。'}</p></section><details class="season-rubric"><summary>评分标准 · 内容80 / 格式10 / 交付10</summary><p class="season-muted">逐项记录证据，三列分开展示。内容合格要求全部内容检查通过；总分不能替代合格判据。</p>${sections}${task.id==='dynamic-pelican'?`<h4>动态核验方式</h4><p>每 ${task.observation.periodSeconds} 秒一个踩踏周期，观察 ${task.observation.cycles} 个完整周期；每周期 ${task.observation.samplesPerCycle} 帧，共 ${task.observation.totalFrames} 个观察帧，另核对 ${task.observation.boundarySeconds.join('、')} 秒循环边界。</p><p>${e(task.observation.note)}</p><p>题目版本：${e(task.scoreVersion)} · 观察多个周期不代表多次调用模型。</p>`:''}<h4>合格与复核条件</h4><ul>${task.gates.map(g=>`<li>${e(g)}</li>`).join('')}</ul></details><details class="season-reference"><summary>出题方参考解 · 不是模型答卷</summary><p>${e(ref.explanation)}</p>${ref.turn2?`<h4>第2轮参考</h4><pre>${e(JSON.stringify(ref.turn2,null,2))}</pre><h4>最终参考</h4>`:''}<pre>${e(answer)}</pre>${ref.artifact?`<img src="${e(ref.artifact)}" width="800" height="600" alt="出题方参考图：A经C、D到E，耗时9分钟；不是模型作品" loading="lazy">`:''}</details><div class="season-task-footer"><span>模型结果：待实测</span><a href="#checkup/season">全部新题 ↑</a></div></div></article>`;
}

export function seasonPage(bank,id){
  validatePlayfulSeason(bank);
  const selected=id?bank.tasks.find(t=>t.id===id):null;
  if(id&&!selected)return '<section class="season-page"><h1>没有这道新题</h1><a class="season-link" href="#checkup/season">返回新一期题目</a></section>';
  if(selected?.id==='dynamic-pelican')return dynamicChallengePage(selected,bank,criteriaMarkup(selected));
  return `<div class="season-page"><div class="season-breadcrumb"><a href="#checkup">首页</a><span>/</span><a href="#checkup/season">整活挑战 · 新一期</a></div><header class="season-intro"><p class="season-eyebrow">开发题集 · ${e(bank.authoredAt.replaceAll('-','.'))}</p><h1>${selected?e(selected.title):'怪题先备好，实测下一步。'}</h1><p>${bank.tasks.length} 类新挑战。题面、参考解与评分标准已定义，模型调用 0 次。</p><div class="season-dimensions"><span>内容 <b>80</b></span><span>格式 <b>10</b></span><span>交付 <b>10</b></span><span class="season-status">待实测</span></div></header><aside class="season-boundary"><strong>这是一套公开开发题</strong><p>${e(bank.protocol.note)}</p><p>${e(bank.protocol.revision)}</p><a href="data/playful-season.json" download="zhufeng-playful-development-v2.json">下载题面与评分 JSON ↓</a></aside>${selected?'':`<nav class="season-directory" aria-label="新一期题目">${bank.tasks.map((t,i)=>`<a href="#checkup/season/${e(t.id)}"><span>0${i+1}</span><strong>${e(t.title)}</strong>${arrowUpRight}</a>`).join('')}</nav>`}${(selected?[selected]:bank.tasks).map(t=>taskArticle(t,bank.tasks.indexOf(t),bank)).join('')}<section class="season-agent"><p class="season-eyebrow">单列专题 / 尚未接入</p><h2>Agent 挑战，另开一桌。</h2><p>后厨经营、双 AI 拆弹等持续操作任务，需要固定工具、时间与费用协议。这里暂不放成绩，也不与旧八题混算。</p></section><footer class="season-footer"><span>${e(bank.suiteId)} · ${e(bank.scoreVersion)}</span><a href="#checkup/results">查看第一期旧成绩 ${arrowRight}</a></footer><p role="status" aria-live="polite" class="season-copy-status" data-season-copy-status></p></div>`;
}

export function bindSeason(main,getBank){
  bindPelicanPlayer(main);
  main.addEventListener('click',async event=>{
    const button=event.target.closest('[data-season-copy]');
    if(!button||!main.contains(button))return;
    const task=getBank()?.tasks.find(t=>t.id===button.dataset.seasonCopy),index=Number(button.dataset.promptIndex);
    if(!task||!Number.isInteger(index)||!task.prompts[index])return;
    const status=main.querySelector('[data-season-copy-status]');
    try{
      if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(task.prompts[index]);
      if(status)status.textContent='已复制本轮题面。';
      const label=button.textContent;button.textContent='已复制';
      if(button.isConnected)setTimeout(()=>{if(button.isConnected)button.textContent=label;},1800);
    }catch{
      if(status)status.textContent='浏览器未允许复制，请在上方题面中手动选择并复制。';
      const prompt=main.querySelector('[data-dynamic-prompt]');if(prompt){prompt.open=true;prompt.scrollIntoView?.({block:'center'});}
    }
  });
}

// These are reading labels tied to the existing record, never a new numeric grade.
export function historicalReading(task,item){
  const output=item.measurement?.output||'',status=item.measurement?.status;
  const delivery=!item.measurement?'未测':status==='success'?'完整返回':item.adjudication?'接口异常，正文经站长确认':'未完整返回，原文保留';
  let content='按原判分查看',format='原协议未单独计分';
  if(task.id==='honesty'){
    content=item.score===2?'已知与未知对应正确':item.score===1&&/没有编造|未编造/.test(item.reason)?'未编造事实；原分另含用词要求':'见原判分说明';
    format=/未按|未使用/.test(item.reason)?'未知项用词未按要求':'未知项用词见原答卷';
  }else if(['visual','zebra'].includes(task.id)){
    content='结构与画面见原判分';
    format=/^\s*<svg\b[\s\S]*<\/svg>\s*$/i.test(output)?'独立 SVG；安全性另经原校验':'原文附说明或围栏；预览保留原图';
  }else if(task.id==='receipt'){
    content='按第一期参考答案判分';format='原题只要求明确数量';
  }else if(task.id==='edit'){
    content=item.score===2?'指定修改完成':'见原判分说明';format=item.score===2?'逐字一致':'见原文差异';
  }else content=item.score===2?'按原标准通过':item.score===null?'待评':'见原判分说明';
  return `<dl class="historical-reading" aria-label="阅读提示，未重新评分"><div><dt>内容</dt><dd>${e(content)}</dd></div><div><dt>格式</dt><dd>${e(format)}</dd></div><div><dt>交付</dt><dd>${e(delivery)}</dd></div></dl><p class="historical-reading-note">阅读提示仅拆开说明；上方分数及原判分不变。</p>`;
}
