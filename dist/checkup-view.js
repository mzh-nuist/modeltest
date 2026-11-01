import {validateCheckupBank,validateCheckupReport,parseCheckupJSON,newCheckupReport,assessCheckupRun,assessCheckupReport,compareCheckups,importCheckupReport,previewableCheckupSVG,changedCharacters,VERDICTS} from './checkup-data.js?v=20261101-short1';

const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag=verdict=>`<span class="checkup-status checkup-${e(verdict)}">${e(VERDICTS[verdict])}</span>`;
const pre=text=>`<pre class="checkup-answer">${e(text||'（这一轮没有记录回答）')}</pre>`;
const head=(title,subtitle,actions='')=>`<div class="page-head"><div><div class="eyebrow">逐风 / AI 日常体检</div><h1>${e(title)}</h1><p class="subtitle">${e(subtitle)}</p></div><div class="head-actions">${actions}</div></div>`;
const kindNote=report=>report.kind==='demo'?'<div class="notice demo"><strong>正在看演示</strong>　回答和判断都是预设样例，没有请求真实模型。<button data-ck-action="leave-demo">退出演示</button></div>':'<div class="checkup-source"><span class="dot"></span> 本地记录 · 模型名称和回答由你填写；尚未通过 API 核验。回答只在当前标签页，刷新前请下载保存。</div>';
const finalAnswer=row=>row?.outputs.at(-1)||'';

export function checkupHome(bank,current) {
  const tried=current.runs.filter(r=>r.status!=='not_run').length;
  return head('今天的 AI，还好用吗？','六件小事，看它有没有理解错、忘条件、乱发挥。', '<a class="button-link primary" href="#checkup/results">看看这次的回答 →</a><button data-ck-action="collected">看自动采集演示</button>')+
    kindNote(current)+`<div class="checkup-intro"><div><strong>5 项日常检查 <span>＋ 1 项可选画图</span></strong><p>不用做题，也不用看一堆分数。放入 AI 的回答，就能逐项对照。</p></div><a href="#checkup/how">怎么测？ →</a></div>`+
    `<div class="checkup-grid">${bank.tasks.map((t,i)=>`<article class="checkup-card"><div class="checkup-card-top"><span class="checkup-number">0${i+1}</span><span>${e(t.category)}${t.optional?' · 可选':''}</span>${tag(assessCheckupRun(t,current.runs[i]).verdict)}</div><h2>${e(t.title)}</h2><p>${e(t.id==='memory'?'先记住两个人、总预算1500元、不开车、周日晚上回来。中间聊三轮，再问它记住了什么。':t.id==='edit'?'先给一句集合通知，再让它只修改时间。其他字能不能一字不动？':t.id==='visual'?'画鹈鹕骑自行车：脚踩踏板、坐在车座、翅膀扶车把。直接看图。':t.prompts[0])}</p><a class="checkup-card-link" href="#checkup/${e(t.id)}">看题目和回答 →</a></article>`).join('')}</div>`+
    `<p class="checkup-footnote">当前放入了 ${tried} 项回答。结果用“正常 / 漏了要求 / 明显答错 / 需要人看”表示；未测会单独保留。一次翻车先看具体原因。</p>`;
}

export function checkupSVG(output,caption="能显示不等于画对了。请看脚、车座、车把和车轮的关系。") {
  if (!output) return '';
  if (!previewableCheckupSVG(output)) return '<p class="checkup-warning">这份 SVG 暂不能安全预览。可以展开原文查看；仅凭这个结果不能判断它的画图能力。</p>';
  const doc='<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>'+output;
  return `<div class="checkup-picture"><iframe title="图画预览，空间关系需要人看" sandbox="" referrerpolicy="no-referrer" srcdoc="${e(doc)}"></iframe></div><p class="evidence-meta">${e(caption)}</p>`;
}

function answerBlock(task,row) {
  if (task.id==='visual') return checkupSVG(finalAnswer(row))+`<details><summary>查看 SVG 原文</summary>${pre(finalAnswer(row))}</details>`;
  if (task.mode==='exact'&&finalAnswer(row)) {
    const diff=changedCharacters(task.exactAnswer,finalAnswer(row).trim());
    return `<div class="checkup-pair"><div><small>应该得到</small>${pre(task.exactAnswer)}</div><div><small>实际回答 · 差异已标出</small><pre class="checkup-answer">${e(diff.prefix)}<mark>${e(diff.changed)}</mark>${e(diff.suffix)}</pre>${diff.expectedChanged?`<p class="evidence-meta">这里应该是：${e(diff.expectedChanged)}</p>`:''}</div></div>`;
  }
  return pre(finalAnswer(row));
}

export function checkupTask(task,row,report) {
  const result=assessCheckupRun(task,row);
  const count=task.prompts.length;
  return '<a class="back" href="#checkup">← 回到六项体检</a>'+head(task.title,task.category+(task.optional?' · 可选，暂不支持时可以跳过':''))+kindNote(report)+
    `<section class="panel"><div class="panel-head"><h2>这项怎么看</h2>${tag(result.verdict)}</div><div class="panel-body"><p class="checkup-expect">${e(task.expected)}</p><p id="checkup-live-result" class="evidence-meta">${e(result.reason)}</p></div></section>`+
    `<section class="panel"><div class="panel-head"><h2>${count>1?'按顺序在同一会话里发':'发给 AI 的题目'}</h2><small>${count} 轮${count>1?' · 每项从一个新会话开始':''}</small></div><div class="panel-body">${count>1?'<p class="checkup-warning">逐轮发送，并保留每轮回答。把所有消息一次贴过去，或只保留最后一轮，都不能确认上下文是否真的记住了。</p>':''}${task.prompts.map((prompt,i)=>`<div class="checkup-turn"><div class="checkup-turn-heading"><strong>${count>1?'第'+(i+1)+'轮':'题目'}</strong><button data-ck-action="copy" data-ck-task="${e(task.id)}" data-ck-step="${i}">复制这条消息</button></div>${pre(prompt)}<label for="ck-output-${i}">${count>1?'这一轮':'AI'}的回答${i===count-1?'（本项主要看这份）':''}</label><textarea id="ck-output-${i}" data-ck-task="${e(task.id)}" data-ck-output="${i}" maxlength="100000" rows="${i===count-1?5:2}" placeholder="粘贴已有回答，不会上传或调用 API">${e(row.outputs[i]||'')}</textarea></div>`).join('')}<label for="ck-note">补充说明（例如中途报错或不支持画图，可留空）</label><textarea id="ck-note" data-ck-note="${e(task.id)}" maxlength="2000" rows="2">${e(row.note)}</textarea><label class="checkup-interrupted"><input type="checkbox" data-ck-incomplete="${e(task.id)}" ${row.status==='incomplete'&&row.outputs.every(o=>o!==null)?'checked':''} ${row.outputs.some(o=>o===null)?'disabled':''}>回答没说完，或中途报错了</label><button class="primary" data-ck-action="show" data-ck-task="${e(task.id)}">看这项结果</button></div></section>`+
    (row.status!=='not_run'?`<section class="panel"><div class="panel-head"><h2>回答放在这里，直接对照</h2>${tag(result.verdict)}</div><div class="panel-body">${answerBlock(task,row)}${task.mode==='guided'?`<div class="checkup-human"><h3>这几个地方对不对？</h3><p class="evidence-meta">${row.status==='complete'?'拿不准就留着，不强行判对。修改回答后，原来的判断会清除。':'会话还不完整，补齐后再确认。'}</p>${task.checks.map(c=>`<label class="checkup-check"><span>${e(c.label)}</span><select aria-label="${e(c.label)}" data-ck-check="${e(c.id)}" data-ck-task="${e(task.id)}" ${row.status==='complete'?'':'disabled'}>${[['unsure','拿不准'],['yes','是'],['no','否']].map(([v,l])=>`<option value="${v}" ${(row.review?.answers[c.id]||'unsure')===v?'selected':''}>${l}</option>`).join('')}</select></label>`).join('')}<p class="evidence-meta">这些是人工确认；系统会保留回答和检查点，不会把关键词命中当成理解正确。</p></div>`:'<p class="evidence-meta">程序只忽略句子首尾空白，逐字比较正文。额外解释、标点或其他改动都会标为“漏了要求”。</p>'}</div></section>`:'')+
    `<div class="core-actions"><a class="button-link" href="#checkup/results">回到这次的结果 →</a><a class="button-link" href="#checkup/compare">和上次比 →</a></div>`;
}

function exportBox(report) {
  return `<details class="checkup-export"><summary>查看可保存的完整记录</summary><p class="evidence-meta">如果下载没有弹出，可以复制这份内容保存成 JSON。记录含每轮回答和人工检查，不含密钥。</p><textarea aria-label="完整六项体检记录" readonly rows="7">${e(JSON.stringify(report,null,2))}</textarea></details>`;
}

export function checkupResults(bank,current) {
  const results=assessCheckupReport(current,bank);
  const issues=results.filter(r=>['wrong','missed'].includes(r.verdict)).length;
  const waiting=results.filter(r=>r.verdict==='review').length;
  const count=results.filter(r=>r.verdict!=='not_run').length;
  return head('这次，哪里需要留意？','先看具体回答。这里没有总分，也不会把一次翻车说成模型整体变差。','<button class="primary" data-ck-action="download">保存这次记录 ↓</button><a class="button-link" href="#checkup/compare">和上次比 →</a>')+kindNote(current)+
    `<section class="panel"><div class="panel-body checkup-metadata"><label for="ck-model">哪个模型？<input id="ck-model" data-ck-meta="modelLabel" value="${e(current.modelLabel)}" maxlength="200"></label><label for="ck-conditions">怎么用的？（可选）<input id="ck-conditions" data-ck-meta="conditions" placeholder="例如：同一入口，默认设置，没有联网" value="${e(current.conditions)}" maxlength="2000"></label><label for="ck-date">这次是什么时候测的？（可选）<input type="datetime-local" id="ck-date" data-ck-date value="${current.checkedAt?e(new Date(current.checkedAt).toISOString().slice(0,16)):''}"><small>按 UTC 填写；日期缺失时不会自动判断前后变化。</small></label></div></section>`+
    `<div class="checkup-summary"><strong>${count?`已放入 ${count} 项回答 · ${issues} 项有问题 · ${waiting} 项需要人看`:'还没有放入模型回答'}</strong><p>${count?'下面可以看到是哪个地方出了问题。画图未测会单独保留。':'先看一份演示，或打开某项，把已有回答放进来。'} <button data-ck-action="demo">看一份演示</button></p></div>`+
    `<div class="checkup-result-list">${bank.tasks.map((t,i)=>`<article class="panel"><div class="panel-head"><h2><a href="#checkup/${e(t.id)}">${i+1}. ${e(t.title)}${t.optional?' · 可选':''}</a></h2>${tag(results[i].verdict)}</div><div class="panel-body"><p class="evidence-meta">${e(results[i].reason)}${results[i].origin==='human'?' · '+(current.kind==='demo'?'合成判断':'人工确认'):''}</p>${current.runs[i].note?`<p class="checkup-warning">${e(current.runs[i].note)}</p>`:''}${current.runs[i].status==='not_run'?'<p class="muted">尚无回答。</p>':answerBlock(t,current.runs[i])}<a class="checkup-card-link" href="#checkup/${e(t.id)}">${current.runs[i].status==='not_run'?'放入回答':'查看题目、每轮回答和检查点'} →</a></div></article>`).join('')}</div>`+
    `<section class="panel"><div class="panel-body"><label for="ck-import-current">打开一份已有记录</label><input type="file" id="ck-import-current" data-ck-import="current" accept=".json,application/json"><p class="evidence-meta">文件只在本机读取；打开记录不会变成真实 API 实测。</p>${exportBox(current)}</div></section>`;
}

export function checkupComparison(bank,previous,current) {
  const comparison=previous?compareCheckups(previous,current,bank):null;
  return head('和上次比，哪里不一样？','同样六道题，把两份回答摆在一起看。','<button data-ck-action="demo">看一组演示对照</button>')+kindNote(current)+
    `<div class="checkup-pair checkup-file-pair"><section class="panel"><div class="panel-body"><h2>上次</h2><p>${e(previous?.modelLabel||'还没有上次记录')}</p><p class="evidence-meta">${e(previous?.checkedAt||'日期未填写')}${previous?' · '+(previous.kind==='demo'?'合成演示':'本地文件，来源自行填写'):''}</p><label for="ck-import-previous">选择上次保存的记录</label><input type="file" id="ck-import-previous" data-ck-import="previous" accept=".json,application/json"></div></section><section class="panel"><div class="panel-body"><h2>这次</h2><p>${e(current.modelLabel)}</p><p class="evidence-meta">${e(current.checkedAt||'日期未填写')}</p><a class="checkup-card-link" href="#checkup/results">查看或保存这次记录 →</a></div></section></div>`+
    (comparison?`<p class="${comparison.comparable?'checkup-source':'checkup-warning'}">${comparison.comparable?'按两份记录自行填写的模型、用法和日期对照；这些信息未经认证。':'模型、用法或前后日期还没对齐。先看回答差别，暂不自动判断哪次更好。'} ${e(comparison.note)}</p>${bank.tasks.map((t,i)=>`<section class="panel"><div class="panel-head"><h2>${e(t.title)}</h2><span class="evidence-meta">${e(comparison.rows[i].note)}</span></div><div class="panel-body checkup-pair"><div><h3>上次 ${tag(comparison.rows[i].previous)}</h3>${answerBlock(t,previous.runs[i])}<p class="evidence-meta">${e(assessCheckupRun(t,previous.runs[i]).reason)}</p></div><div><h3>这次 ${tag(comparison.rows[i].current)}</h3>${answerBlock(t,current.runs[i])}<p class="evidence-meta">${e(assessCheckupRun(t,current.runs[i]).reason)}</p></div></div></section>`).join('')}`:'<div class="empty"><div><strong>还缺一份上次的记录</strong><p>可以选择已有文件，或先看一组演示对照。演示不会覆盖你的当前记录。</p></div></div>');
}

function howView(offline) {
  return head('怎么测？就这几步','测试的是 AI，你不用答这些题。','<a class="button-link" href="#checkup">回到六项体检 →</a>')+
    `<section class="panel"><div class="panel-body checkup-how"><ol><li><strong>自动依次发这几道题。</strong>本机运行器每项开新会话；记忆题和改字题会保留前面每轮回答，画图可选。</li><li><strong>采集后，打开记录看回答。</strong>网页负责展示，本机运行器负责调用接口，密钥留在本机。现在可以看本机模拟接口完成的自动采集演示；真实调用需要另外确认预算。</li><li><strong>直接看哪里出错。</strong>改字题能逐字核对，其余按几个生活化检查点确认；拿不准就留着。</li><li><strong>保存记录，下次并排比。</strong>尽量用同一模型、同一入口和设置。公开小题可能被记住，一次答对或答错都不代表全部能力。</li></ol><p>正常：这题的检查点都满足。漏了要求：遗漏或多改了内容。明显答错：核心事实或目的出错。需要人看：还没判断或会话不完整。未测：没有回答。</p></div></section>`+
    `<section class="panel"><div class="panel-head"><h2>自动测试流程已就绪</h2><span class="tag">0 次模型 API</span></div><div class="panel-body"><p>两种API协议已用本机模拟接口完成逐轮采集验收。<button data-ck-action="collected">看自动采集演示</button></p><p>${offline?`${offline.passed} 个预设样例已检查程序路径。`:'离线样例报告暂不可用。'}它们不代表真实模型成绩。没有新增速度、费用或“降智”结论。</p><p class="evidence-meta">可选画图目前接收静态SVG并在隔离画框显示；不支持原生图片文件，也不会自动判断画得好不好。</p><details><summary>本机离线命令（开发者用）</summary>${pre('python -X utf8 -m runner.checkup template --out results/my-checkup.json\npython -X utf8 -m runner.checkup offline --out results/checkup-offline.json\npython -X utf8 -m runner.checkup check --input results/my-checkup.json --out results/checked.json\npython -X utf8 -m runner.checkup_http_fixture --out results/new-http-check')}</details></div></section>`;
}

export function createCheckupController({main,toast,download,rerender,routePrefix='checkup'}) {
  let bank=null,live=null,previous=null,demo=null,autoDemo=null,offline=null,loading=null,error='',demoMode=false;
  const active=()=>demoMode==='auto'?autoDemo:demoMode?demo.current:live;
  const baseline=()=>demoMode==='auto'?null:demoMode?demo.previous:previous;
  const onPage=()=>(!location.hash&&routePrefix==='checkup')||location.hash.startsWith('#'+routePrefix);
  async function load() {
    if (loading) return loading;
    loading=(async()=>{
      try {
        const fetchJSON=async path=>{const r=await fetch(path);if(!r.ok)throw Error('本地数据读取失败');return parseCheckupJSON(await r.text());};
        bank=validateCheckupBank(await fetchJSON('data/checkup.json')); live=newCheckupReport(bank);
        const extra=await Promise.allSettled([fetchJSON('data/checkup-demo.json'),fetchJSON('data/checkup-offline.json'),fetchJSON('data/checkup-collected-demo.json')]);
        if (extra[0].status==='fulfilled') { demo=extra[0].value;validateCheckupReport(demo.current,bank);validateCheckupReport(demo.previous,bank); }
        if (extra[2].status==='fulfilled'){autoDemo=validateCheckupReport(extra[2].value,bank);if(autoDemo.kind!=='demo')throw Error('自动采集演示来源标记错误');}
        if (extra[1].status==='fulfilled'&&extra[1].value.schemaVersion==='daily-checkup-offline-v1'&&extra[1].value.modelApiCalls===0) offline=extra[1].value;
      } catch(err) { error=err.message; }
      if(onPage())rerender();
    })(); return loading;
  }
  function render(path='') {
    if(!bank&&!error){load();return '<p>正在准备六项日常体检…</p>';}
    if(error)return head('体检页面暂时没读出来',error)+'<p>请通过本机 HTTP 服务打开网站。</p>';
    const report=active();
    if(path==='results')return checkupResults(bank,report);
    if(path==='compare')return checkupComparison(bank,baseline(),report);
    if(path==='how')return howView(offline);
    if(path){const i=bank.tasks.findIndex(t=>t.id===path);return i<0?head('没有找到这一项','请回到六项体检。'):checkupTask(bank.tasks[i],report.runs[i],report);}
    return checkupHome(bank,report);
  }
  main.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-ck-action]'); if(!b||!bank)return;
    try {
      const action=b.dataset.ckAction;
      if(action==='collected'){if(!autoDemo)throw Error('自动采集演示文件暂不可用');demoMode='auto';location.hash=routePrefix+'/results';rerender();}
      if(action==='demo'){if(!demo)throw Error('演示文件暂不可用');demoMode=true;rerender();}
      if(action==='leave-demo'){demoMode=false;rerender();}
      if(action==='copy'){
        const task=bank.tasks.find(t=>t.id===b.dataset.ckTask),prompt=task.prompts[+b.dataset.ckStep];
        try{await navigator.clipboard.writeText(prompt);toast('已复制这条消息');}catch{toast('复制暂不可用，请直接选择题目文字复制');}
      }
      if(action==='show'){validateCheckupReport(active(),bank);rerender();}
      if(action==='download'){validateCheckupReport(active(),bank);download(JSON.stringify(active(),null,2),'ai-daily-checkup.json','application/json');toast('已准备下载；完整记录也可以在页面底部展开复制');}
    } catch(err){toast(err.message);}
  });
  main.addEventListener('input',ev=>{
    if(!bank||!onPage())return; const el=ev.target,report=active();
    if(el.dataset.ckMeta)report[el.dataset.ckMeta]=el.dataset.ckMeta==='modelLabel'&&!el.value.trim()?'尚未填写模型名称':el.value;
    if(el.hasAttribute('data-ck-output')){
      const i=bank.tasks.findIndex(t=>t.id===el.dataset.ckTask),row=report.runs[i];
      const interrupted=row.status==='incomplete'&&row.outputs.every(o=>o!==null);
      row.outputs[+el.dataset.ckOutput]=el.value.trim()?el.value:null;
      const n=row.outputs.filter(x=>x!==null).length;
      row.status=n===row.outputs.length&&!interrupted?'complete':n?'incomplete':'not_run';row.review=null;
      const cutoff=main.querySelector('[data-ck-incomplete]');if(cutoff){cutoff.disabled=n!==row.outputs.length;cutoff.checked=interrupted;}
      main.querySelectorAll('[data-ck-check]').forEach(select=>{select.value='unsure';select.disabled=row.status!=='complete';});
      const assessment=assessCheckupRun(bank.tasks[i],row);
      const result=main.querySelector('#checkup-live-result');if(result)result.textContent=assessment.reason+' 回答已修改，点击“看这项结果”更新下方预览。';
      main.querySelectorAll('.checkup-status').forEach(badge=>{badge.className='checkup-status checkup-'+assessment.verdict;badge.textContent=VERDICTS[assessment.verdict];});
    }
    if(el.dataset.ckNote){const row=report.runs.find(r=>r.taskId===el.dataset.ckNote);row.note=el.value;}
  });
  main.addEventListener('change',async ev=>{
    if(!bank||!onPage())return;const el=ev.target;
    try {
      if(el.hasAttribute('data-ck-date'))active().checkedAt=el.value?new Date(el.value+'Z').toISOString():null;
      if(el.dataset.ckIncomplete){const row=active().runs.find(r=>r.taskId===el.dataset.ckIncomplete);row.status=el.checked?'incomplete':'complete';row.review=null;rerender();}
      if(el.dataset.ckCheck){
        const row=active().runs.find(r=>r.taskId===el.dataset.ckTask);
        row.review={answers:Object.fromEntries([...main.querySelectorAll('[data-ck-check]')].map(x=>[x.dataset.ckCheck,x.value])),note:''};
        validateCheckupReport(active(),bank);rerender();
      }
      if(el.dataset.ckImport){
        const file=el.files[0];if(!file)return;if(file.size>2*1024*1024)throw Error('记录不能超过2MB');
        const imported=importCheckupReport(await file.text(),bank);
        if(el.dataset.ckImport==='previous')previous=imported;else live=imported;
        demoMode=false;rerender();toast('已在本机打开记录，未上传');
      }
    }catch(err){toast('没有加载这份记录：'+err.message);if(el.type==='file')el.value='';}
  });
  return {render};
}
