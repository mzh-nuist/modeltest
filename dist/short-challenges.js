import {gradeShort} from './short-challenge-grading.js?v=20261101-short1';
import {gradeShort as previousGrade,parseBoard,simulateBoss,gearFeasible} from './short-challenge-engine.js?v=20261101-short1';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateShortBank(bank){
  if(bank?.schemaVersion!=='short-challenges-v1'||bank.suiteId!=='zhufeng-short-20261101-v1'||!['short-rubric-v1','short-rubric-v2'].includes(bank.scoreVersion)||bank.tasks?.length!==2)throw Error('短题版本不符');
  if(bank.protocol?.casesPerTask!==2||bank.protocol.repeats!==1||bank.protocol.aggregateScore!==null||bank.protocol.content!==80||bank.protocol.format!==10||bank.protocol.delivery!==10)throw Error('短题协议不符');
  bank.tasks.forEach((t,i)=>{
    if(t.id!==['boss-sokoban','gear-scam'][i]||t.cases?.length!==2||t.criteria?.filter(c=>c.dimension==='content').reduce((n,c)=>n+c.max,0)!==80)throw Error('短题样例不符');
    for(const c of t.cases){if(typeof c.prompt!=='string'||!c.prompt.trim())throw Error('短题为空');if(t.id==='boss-sokoban')parseBoard(c.board);else if(c.vertices?.join('')!=='ABCDE'||c.edges.length>10||c.edges.some(x=>!/^[A-E]{2}$/.test(x)||x[0]===x[1])||new Set(c.edges.map(x=>[...x].sort().join(''))).size!==c.edges.length)throw Error('齿轮约束不符');}
  });return bank;
}
export function validateShortResults(results,bank){
  if(results?.schemaVersion!=='short-results-v1'||results.suiteId!==bank.suiteId||results.scoreVersion!==bank.scoreVersion||results.maxOutputTokens!==16384||results.effort!=='high'||results.repeatsPerCase!==1||results.automaticRetries!==0||!Array.isArray(results.records)||results.records.length>40||results.modelCalls!==results.records.length)throw Error('短题实测版本不符');
  const seen=new Set();let successes=0;
  for(const r of results.records){
    const task=bank.tasks.find(t=>t.id===r.taskId),example=task?.cases.find(c=>c.id===r.caseId),key=r.modelId+'/'+r.caseId;
    if(!example||seen.has(key)||typeof r.output!=='string'||!r.name||!r.apiModel||!/^[a-f0-9]{64}$/.test(r.sourceDigest)||r.effort!=='high'||r.maxOutputTokens!==16384)throw Error('短题答卷不符');
    seen.add(key);if(r.status==='success')successes++;
    const actual=gradeShort(task,example,r.output,r.status);
    for(const field of ['content','format','delivery','total','passed'])if(actual[field]!==r.grade?.[field])throw Error('短题分数与答卷不符');
    if(JSON.stringify(actual.evidence)!==JSON.stringify(r.grade.evidence))throw Error('短题判分证据不符');
    if(r.previousGrade){const prior=previousGrade(task,example,r.output,r.status);for(const f of ['content','format','delivery','total'])if(prior[f]!==r.previousGrade[f])throw Error('初版试评分与原文不符');}
  }
  if(successes!==results.successfulRequests)throw Error('短题成功计数不符');return results;
}
export function shortOverview(bank,results){
  return `<section class="short-overview"><p class="season-eyebrow">短题实测 · 独立计分</p><h2>这次，把老板推到岗，把齿轮修到能转。</h2><p>${results?.modelCalls??0} 次实际请求 · 每题2个样例 · 程序按动作和约束判分，旧成绩保留。</p><div class="short-cards">${bank.tasks.map(t=>`<a href="#checkup/season/${e(t.id)}"><h3>${e(t.title)}</h3><p>${e(t.hook)}</p><strong>看题面、回放与实际答卷 →</strong></a>`).join('')}</div></section>`;
}
function modelsFor(results,task){
  const map=new Map();for(const r of results?.records||[])if(r.taskId===task.id&&!map.has(r.modelId))map.set(r.modelId,{id:r.modelId,name:r.name});return [...map.values()];
}
function modelScore(results,task,id){
  const rows=task.cases.map(c=>results?.records.find(r=>r.modelId===id&&r.caseId===c.id));
  if(rows.some(r=>!r))return null;
  const avg=k=>rows.reduce((n,r)=>n+r.grade[k],0)/rows.length;
  return {content:avg('content'),format:avg('format'),delivery:avg('delivery'),total:avg('total'),passed:rows.every(r=>r.grade.passed),rows};
}
function answers(task,results){
  const models=modelsFor(results,task);
  if(!models.length)return '<p>模型答卷尚未采集；示意内容不参与成绩。</p>';
  return `<div class="short-table-wrap" tabindex="0" role="region" aria-label="${e(task.title)}独立成绩"><table class="short-table"><thead><tr><th>模型</th><th>内容 /80</th><th>格式 /10</th><th>交付 /10</th><th>本题 /100</th></tr></thead><tbody>${models.map(m=>{
    const s=modelScore(results,task,m.id);return `<tr><th>${e(m.name)}</th>${s?`<td>${s.content}</td><td>${s.format}</td><td>${s.delivery}</td><td><strong>${s.total}</strong><br><small>${s.passed?'内容全过':'内容未全过'}</small></td>`:'<td colspan="4">未完成采集，不补零</td>'}</tr>`;
  }).join('')}</tbody></table></div><p class="season-muted">每列为两个样例的平均分。内容全过要求两例均通过；每例仅一次采样，不是稳定性排名。接口错误或输出耗尽按本条件的交付失败记录，不能据此认定规划内容错误。</p>${models.map(m=>`<details class="short-model-answer"><summary>${e(m.name)} · 原始回答与判分</summary>${task.cases.map(c=>{
    const r=results.records.find(r=>r.modelId===m.id&&r.caseId===c.id);if(!r)return `<p>${e(c.label)}：未发送</p>`;
    return `<section><h4>${e(c.label)} · ${r.grade.total}/100</h4><p>内容 ${r.grade.content}/80 · 格式 ${r.grade.format}/10 · 交付 ${r.grade.delivery}/10 · ${e(r.status)}${r.error?' · '+e(r.error):''}</p><pre>${e(r.output||'正文为空')}</pre><p>${e(gradeExplanation(task,r.grade))}</p>${r.previousGrade&&r.previousGrade.total!==r.grade.total?`<p>初版试评分 ${r.previousGrade.total} → 当前 ${r.grade.total}；仅修订判分，未重新采样。</p>`:''}<button type="button" data-short-view="${e(m.id)}" data-short-case-id="${e(c.id)}">在上方回放这份答卷 ↑</button><details><summary>本次请求与核验信息</summary><p>${e(r.provider)} · ${e(r.apiModel)} · high · 输出上限 ${r.maxOutputTokens} token</p><p>实际输入 ${r.tokenUsage.inputTokens??'未知'} · 实际输出 ${r.tokenUsage.outputTokens??'未知'} token（按接口报告）</p><p>采集时间 ${e(r.checkedAt)}</p><p class="short-digest">原始证据 SHA-256：${e(r.sourceDigest)}</p></details></section>`;
  }).join('')}</details>`).join('')}`;
}
function gradeExplanation(task,g){
  const v=g.evidence;
  if(v.reason)return v.reason;
  if(task.id==='boss-sokoban'&&v.moves===null)return '未提取到唯一动作串，内容无法执行核验，按本协议计0内容分；原文保留。';
  if(task.id==='boss-sokoban')return `${v.steps??'未解析'}步 / 上限${v.limit}步；${v.illegalAt!==null?'第'+v.illegalAt+'步非法；':''}${v.solved?'两位老板均到岗':'未全部到岗'}；${v.withinLimit?'步数未超限':'步数超限'}。`;
  return `原机构${v.expectedCan?'可行':'不可行'}，判断${v.feasibilityCorrect?'正确':'错误'}；最少拆${v.minimumCuts}对；修复方案${v.validRepair?'合格':'不合格'}。`;
}
export function shortTaskPage(bank,results,id){
  const task=bank.tasks.find(t=>t.id===id);if(!task)return '';
  const models=modelsFor(results,task);
  return `<div class="season-page short-page" data-short-task="${e(id)}"><div class="season-breadcrumb"><a href="#checkup">首页</a><span>/</span><a href="#checkup/season">整活挑战</a></div><header class="short-intro"><p class="season-eyebrow">短题实测 · ${models.length}款模型 · 独立计分</p><h1>${e(task.title)}</h1><p>${e(task.hook)}</p><p class="season-muted">${e(task.ability)}</p><div class="short-actions"><button type="button" class="short-primary" data-short-copy>复制当前样例</button><button type="button" data-short-results>看真实成绩 ↓</button></div></header>
  <section class="short-player" aria-label="答卷回放"><div class="short-selectors"><label>样例<select data-short-case>${task.cases.map((c,i)=>`<option value="${i}">${e(c.label)}</option>`).join('')}</select></label><label>答卷<select data-short-model><option value="reference">出题方示意 · 非模型答卷</option>${models.map(m=>`<option value="${e(m.id)}">${e(m.name)}</option>`).join('')}</select></label></div><p data-short-source class="short-source">出题方示意 · 非模型答卷</p><div data-short-stage class="short-stage"></div><div class="short-actions"><button type="button" data-short-action="play">${id==='boss-sokoban'?'播放动作':'应用拆除方案'}</button>${id==='boss-sokoban'?'<button type="button" data-short-action="next">下一步</button>':''}<button type="button" data-short-action="reset">${id==='boss-sokoban'?'回到起点':'还原机构'}</button></div><p role="status" aria-live="polite" data-short-progress></p><p data-short-grade class="short-grade"></p><details><summary>查看当前答卷原文</summary><pre data-short-output></pre></details>${id==='gear-scam'?'<p class="season-muted">这是转向约束图，不是实体齿轮装配或动力学模拟。</p>':''}</section>
  <section class="short-rules"><h2>题目与评分</h2><p>独立100分：内容80 · 格式10 · 交付10；两个样例等权平均。</p><details class="short-prompt"><summary>完整题面 · 当前样例</summary><pre data-short-prompt>${e(task.cases[0].prompt)}</pre></details><details class="season-rubric"><summary>展开评分标准与合格判据</summary>${task.criteria.map(c=>`<section><h3>${e(c.label)} · ${c.max}分</h3><p>${e(c.rule)}</p></section>`).join('')}<p>${e(bank.protocol.note)}</p></details><details><summary>参考答案与来源 · 不是模型答卷</summary>${task.cases.map(c=>`<h3>${e(c.label)}</h3><pre>${e(typeof c.reference==='string'?c.reference:JSON.stringify(c.reference,null,2))}</pre>`).join('')}<p>${task.source.url?`<a href="${e(task.source.url)}" target="_blank" rel="noopener noreferrer">${e(task.source.title)}</a>`:e(task.source.title)} · ${e(task.source.note)}</p></details></section>
  <section id="short-results" class="short-results"><h2>真实模型成绩与答卷</h2>${results?.gradingRevision?'<p>判分已修正：正确方案与额外说明分开核对，原答卷保留。修订记录可在下方展开。</p>':''}${answers(task,results)}</section><details class="short-protocol"><summary>测试条件、版本与下载</summary><p>${e(bank.protocol.limitation)}</p><p>high · 每次最多16384输出token（含服务商计入的推理token），不设客户端总时长，无自动重试；每个样例独立会话，不提供参考答案或工具。型号按第三方服务商声明，未独立核验上游身份。</p><p>${e(bank.protocol.revision)}</p>${results?.gradingRevision?`<p>${e(results.gradingRevision)}</p><a href="data/short-challenges-v1.json" download>初版采集题库</a> · <a href="data/short-challenge-results-v1.json" download>初版试评分与原答卷</a>`:''}<p>${e(bank.suiteId)} · ${e(bank.scoreVersion)} · 本批实际请求 ${results?.modelCalls??0} 次</p><a href="data/short-challenges.json" download>下载题面与评分</a> · <a href="data/short-challenge-results.json" download>下载本批公开答卷</a></details><footer class="season-footer"><a href="#checkup/season">全部新题</a><a href="#checkup/results">查看第一期旧成绩 →</a></footer><p role="status" aria-live="polite" data-short-copy-status></p></div>`;
}
function boardMarkup(example,frame){
  const boxes=new Set(frame.boxes);return `<div class="short-board" role="img" aria-label="推老板棋盘" style="--short-cols:${example.board[0].length}">${example.board.flatMap((row,r)=>[...row].map((c,x)=>{
    const key=`${r},${x}`,goal=c==='.',box=boxes.has(key),player=frame.player===key;
    return `<span class="short-cell ${c==='#'?'wall':''} ${goal?'goal':''} ${box?'boss':''} ${player?'you':''}">${player?'P':box?'B':goal?'·':''}</span>`;
  })).join('')}</div><p class="short-legend">P＝你 · B＝老板 · 绿格＝工位 · 深格＝墙</p>`;
}
function gearMarkup(example,cut,applied){
  const chosen=new Set(Array.isArray(cut)?cut.filter(x=>typeof x==='string').map(x=>[...x].sort().join('')):[]),edges=example.edges.filter(x=>!applied||!chosen.has([...x].sort().join('')));
  const ok=gearFeasible(example.vertices,edges),colors=new Map([['A',0]]),q=['A'];
  while(q.length){const v=q.shift();for(const [a,b] of edges){const n=a===v?b:b===v?a:null;if(n&&!colors.has(n)){colors.set(n,1-colors.get(v));q.push(n);}}}
  const points=Object.fromEntries(example.vertices.map((v,i)=>[v,[200+136*Math.cos(-Math.PI/2+i*2*Math.PI/5),165+122*Math.sin(-Math.PI/2+i*2*Math.PI/5)]]));
  return `<svg viewBox="0 0 400 340" role="img" aria-label="齿轮转向约束图，${ok?'转向兼容':'转向冲突或不连通'}">${example.edges.map(x=>{const [a,b]=x,[x1,y1]=points[a],[x2,y2]=points[b],removed=applied&&chosen.has([...x].sort().join(''));return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="gear-edge ${removed?'removed':''}"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-6}" class="gear-edge-label">${x}</text>`;}).join('')}${example.vertices.map(v=>`<g><circle cx="${points[v][0]}" cy="${points[v][1]}" r="24" class="gear-node"/><text x="${points[v][0]}" y="${points[v][1]+6}" class="gear-name">${v}</text><text x="${points[v][0]}" y="${points[v][1]+45}" class="gear-direction">${ok&&colors.has(v)?colors.get(v)===0?'↻':'↺':'?'}</text></g>`).join('')}</svg><p class="short-legend">${applied?'红虚线＝答卷提出断开的啮合':'实线＝原始啮合关系'} · ${ok?'转向兼容且A连到全部':'转向冲突或A未连到全部'}</p>`;
}
export function bindShortChallenges(main,getBank,getResults){
  if(typeof main.querySelector!=='function')return;
  let root=null,timer=null,index=0,applied=false;
  function stop(){if(timer!==null){clearInterval(timer);timer=null;}const b=root?.querySelector('[data-short-action="play"]');if(b)b.textContent=getTask()?.id==='boss-sokoban'?'播放动作':'应用拆除方案';}
  function getTask(){return getBank()?.tasks.find(t=>t.id===root?.dataset.shortTask);}
  function current(){
    const t=getTask();if(!t)return null;const c=t.cases[Number(root.querySelector('[data-short-case]').value)],id=root.querySelector('[data-short-model]').value;
    const r=id==='reference'?null:getResults()?.records.find(r=>r.modelId===id&&r.caseId===c.id);
    const output=id==='reference'?(typeof c.reference==='string'?c.reference:JSON.stringify(c.reference,null,2)):r?.output||'';
    return {t,c,id,r,output,g:gradeShort(t,c,output,id==='reference'?'success':r?.status||'not_run')};
  }
  function draw(){
    if(!root?.isConnected)return stop();const s=current();if(!s)return;
    root.querySelector('[data-short-prompt]').textContent=s.c.prompt;root.querySelector('[data-short-output]').textContent=s.output||'本样例尚未发送，没有模型答卷。';
    root.querySelector('[data-short-source]').textContent=s.id==='reference'?'出题方示意 · 非模型答卷':`${s.r?.name||s.id} · 真实模型答卷 · ${s.r?.status||'未发送'}${s.r?.error?' · '+s.r.error:''}`;
    root.querySelector('[data-short-grade]').textContent=s.id==='reference'?'出题方示意不参与模型成绩。':s.r?`本例 ${s.g.total}/100：内容${s.g.content}、格式${s.g.format}、交付${s.g.delivery}。${gradeExplanation(s.t,s.g)}`:'未发送不计0分。';
    const stage=root.querySelector('[data-short-stage]'),progress=root.querySelector('[data-short-progress]');
    if(s.t.id==='boss-sokoban'){
      const sim=simulateBoss(s.c,s.g.answer||'');index=Math.min(index,sim.frames.length-1);stage.innerHTML=boardMarkup(s.c,sim.frames[index]);
      progress.textContent=`第 ${index} / ${sim.frames.length-1} 步${index===sim.frames.length-1?' · '+(sim.illegalAt?'第'+sim.illegalAt+'步非法，已停止':s.g.passed?'全部到岗':s.g.answer?'未通过内容检查':'没有可回放的动作串'):''}`;
      if(index===sim.frames.length-1)stop();
    }else{stage.innerHTML=gearMarkup(s.c,s.g.answer?.cut,applied);progress.textContent=applied?gradeExplanation(s.t,s.g):'当前为原始机构；点击应用答卷中的拆除方案。';}
  }
  function setup(){const next=main.querySelector('[data-short-task]');if(next!==root){stop();root=next;index=0;applied=false;if(root)draw();}}
  if(typeof MutationObserver==='function')new MutationObserver(setup).observe(main,{childList:true});
  main.addEventListener('change',event=>{if(event.target.matches('[data-short-case],[data-short-model]')){stop();index=0;applied=false;draw();}});
  main.addEventListener('click',async event=>{
    if(event.target.closest('[data-short-results]')&&root){root.querySelector('#short-results').scrollIntoView({block:'start'});return;}
    const view=event.target.closest('[data-short-view]');if(view&&root){stop();root.querySelector('[data-short-model]').value=view.dataset.shortView;const t=getTask();root.querySelector('[data-short-case]').value=String(t.cases.findIndex(c=>c.id===view.dataset.shortCaseId));index=0;applied=false;draw();root.querySelector('.short-player').scrollIntoView({block:'start'});return;}
    const copy=event.target.closest('[data-short-copy]');if(copy&&root){const status=root.querySelector('[data-short-copy-status]');try{await navigator.clipboard.writeText(current().c.prompt);status.textContent='已复制当前样例。';}catch{root.querySelector('.short-prompt').open=true;status.textContent='浏览器未允许复制，请在完整题面中手动选择并复制。';root.querySelector('.short-prompt').scrollIntoView({block:'center'});}return;}
    const b=event.target.closest('[data-short-action]');if(!b||!root)return;const s=current();
    if(b.dataset.shortAction==='reset'){stop();index=0;applied=false;draw();}
    else if(b.dataset.shortAction==='next'){stop();index++;draw();}
    else if(s.t.id==='gear-scam'){applied=true;draw();}
    else if(timer!==null)stop();
    else{const sim=simulateBoss(s.c,s.g.answer||'');if(index>=sim.frames.length-1)index=0;timer=setInterval(()=>{index++;draw();},500);b.textContent='暂停';draw();}
  });setup();
}
