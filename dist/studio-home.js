import {answerEffort,effortBadge} from './thinking-effort.js?v=20261125-effort1';
import {arrowUpRight,arrowRight} from './ui-icons.js?v=20261101-short1';
import {weightedSummary,points,formatPoints,siteStars} from './weighted-score.js?v=20261123-suite2';
import {extractDrawing} from './completed-suite.js?v=20261125-effort1';
import {previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
import {modelBadge} from './model-identity.js?v=20261118-models4';

const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=(route='')=>'#checkup'+(route?'/'+route:'');
const shortNames=['理解需求','推理纠错','定点改字','多轮记忆','不乱编','画图连接','账单整活','斑马绘画'];
const titles=['洗车店只有 50 米，要开车吗？','9:40 出门，35 分钟后是 10:05？','只改时间，其他字一字不动','聊了几轮，还记得出游条件吗？','会议没说的，能不能不乱补？','鹈鹕骑车，脚和踏板要接对','辣椒炒肉，到底有几份？','在非洲草原上，画一只奔跑的斑马'];
const taskLabel=(task,i)=>task.agentKey?task.name:shortNames[i];
const taskHref=task=>task.destination||url(task.id);
const artTasks={zebra:{name:'斑马奔跑',title:'草原上，谁的斑马跑起来了？',prompt:'画一只在非洲稀树草原上奔跑的斑马。'},visual:{name:'鹈鹕骑车',title:'会画鸟，也要会骑车。',prompt:'画鹈鹕骑自行车：脚踩踏板、翅膀扶把、坐在车座上。'}};
const link=(route,label)=>`<a class="column-link" href="${url(route)}">${label} ${arrowRight}</a>`;
const christmasLink=()=>link('agent-challenge','圣诞树与并发缓存');
const codexLink=()=>link('codex-gpt62','新实测 · GPT‑6.2 Sol 对 Astra');
const modelEffort=row=>effortBadge(...row.items.map(answerEffort));
const modelLink=(model,label)=>`<a class="column-model" href="${url('model/'+model.id)}">${modelBadge(model.id)}<span>${e(model.name)}${label}</span></a>`;
const pageHead=(label,title,description)=>`<header class="column-heading"><div><p class="column-kicker">${label}</p><h1>${title}</h1><p>${description}</p></div></header>`;
const sectionHead=(index,title,route,label)=>`<div class="column-section-head"><h2>${index?`<span>${index}</span>`:''}${title}</h2>${route?link(route,label):title==='八项成绩'?'<span class="score-scroll-hint" aria-hidden="true">← 左右滑动 →</span>':''}</div>`;
const originalText=value=>`<pre class="column-original">${e(value||'本次没有正文回答。')}</pre>`;
const status=item=>item.score===null?'待评':item.score===2?'达成要求':item.score===0?'未达要求':'部分达成';
const statusClass=item=>item.score===null?'pending':item.score===2?'pass':item.score===0?'fail':'partial';

// Only existing successful, safe SVG responses can enter the exhibit.
// Render as inert images; do not inject model-generated markup into the page.
export function drawingCatalog(data,book){
  return Object.fromEntries(Object.keys(artTasks).map(taskId=>{
    const index=book.tasks.findIndex(t=>t.id===taskId),task=book.tasks[index];
    if(!task)return [taskId,[]];
    return [taskId,data.models.flatMap(model=>{
      const item=book.models.find(row=>row.modelId===model.id)?.items[index];
      const svg=extractDrawing(item?.measurement?.output).svg;
      if(item?.measurement?.status!=='success'||!previewableCheckupSVG(svg))return [];
      return [{model,task,item,svg,score:points(item.score,task.weight)}];
    })];
  }));
}
function artImage(entry,eager=false){
  return `<img class="work-image" src="data:image/svg+xml;charset=utf-8,${e(encodeURIComponent(entry.svg))}" alt="${e(entry.model.name)}的${e(artTasks[entry.task.id].name)}原作" loading="${eager?'eager':'lazy'}" decoding="async" width="800" height="600">`;
}
function artCard(entry,{eager=false,issue=false,detail=false,compact=false}={}){
  const {model,task,item,score}=entry;
  const picture=detail?`<div class="work-picture">${artImage(entry,true)}</div>`:`<a class="work-picture" href="${url('works/'+task.id+'/'+model.id)}" aria-label="放大${e(model.name)}的${e(artTasks[task.id].name)}原作">${artImage(entry,eager)}<span class="work-expand">查看原作 ${arrowUpRight}</span></a>`;
  return `<article class="work-card${issue?' issue-card':''}${compact?' home-work-card':''}"><header>${modelLink(model,effortBadge(answerEffort(item)))}${compact?'':`<span class="result-label ${statusClass(item)}">${e(status(item))}</span>`}</header>${picture}<div class="work-caption"><h3>${compact?e(status(item)):e(artTasks[task.id].name)}</h3><span class="work-score"><strong>${score===null?'待评':formatPoints(score)}</strong> / ${task.weight}</span></div>${issue?`<p class="issue-observation">${e(item.weightedNote||item.reason)}</p><span class="repair-pending">尚无返工答卷</span>`:''}${compact?'':`<details class="work-evidence"><summary>判分与原回答</summary>${item.measurement.followup?`<p>${e(item.measurement.condition)}</p>`:''}<p>${e(item.weightedNote||item.reason)}</p>${originalText(item.measurement.output)}${link('model/'+model.id,'完整答卷')}</details>`}</article>`;
}
function rankedModels(data,book){
  return data.models.map(model=>{
    const row=book.models.find(r=>r.modelId===model.id);
    return {model,row,score:weightedSummary(book,row)};
  }).filter(({score})=>score.complete).sort((a,b)=>b.score.finalScore-a.score.finalScore);
}
function modelCards(data,book){
  return rankedModels(data,book).map(({model,row,score})=>{
    return `<a class="column-model-card" href="${url('model/'+model.id)}"><span class="column-model">${modelBadge(model.id)}<span>${e(model.name)}${modelEffort(row)}</span></span><span class="model-card-score"><strong>${score.finalScore===null?'—':formatPoints(score.finalScore)}</strong><small>/ 100</small></span><span class="model-card-footer">${siteStars(book,row)}<span class="card-open">看答卷 ${arrowRight}</span></span></a>`;
  }).join('');
}
function pendingModels(data,book){
  const models=data.models.map(model=>{
    const row=book.models.find(r=>r.modelId===model.id);
    return {model,row,score:weightedSummary(book,row)};
  }).filter(({score})=>!score.complete);
  if(!models.length)return '';
  if(book.agentTasks)models.sort((a,b)=>b.score.graded-a.score.graded);
  return `<section class="pending-models" aria-label="待测与待复核模型"><h2>${book.agentTasks?'尚未排入主榜':'待测 / 待复核模型'} <span>${models.length} 款</span></h2><div class="pending-model-grid">${models.map(({model,row,score})=>{
    const note=book.agentTasks?book.tasks.filter((task,i)=>!task.agentKey&&row.items[i].score===null).map(task=>task.name).join('、'):(model.pendingReason||'答卷尚未完成，暂不排名。');
    const taskStatus=book.agentTasks?book.tasks.map((task,i)=>{
      if(!task.agentKey)return '';
      const value=points(row.items[i].score,task.weight);
      return `<span><span>${e(task.name)}</span><strong>${value===null?'待测':formatPoints(value)+' / '+task.weight}</strong></span>`;
    }).join(''):'';
    return `<a class="pending-model-card" href="${url('model/'+model.id)}">
      <span class="column-model">${modelBadge(model.id)}<span>${e(model.name)}${modelEffort(row)}</span></span>
      ${taskStatus?`<span class="pending-agent-scores">${taskStatus}</span><span class="pending-model-note">已评 ${score.graded} / ${book.tasks.length} 题${note?' · 待补或复核 '+e(note):''}</span>`:`<span class="pending-model-note">${e(note)}</span>`}
      <span class="pending-open">${book.agentTasks?'看答卷':model.report.runs.some(run=>run.status!=='not_run')?'待复核':'待测'} ${arrowRight}</span></a>`;
  }).join('')}</div></section>`;
}
export function studioScores(data,book,{filter='all'}={}){
  const rows=data.models.map(m=>({m,row:book.models.find(r=>r.modelId===m.id)})).filter(({row})=>weightedSummary(book,row).complete).sort((a,b)=>weightedSummary(book,b.row).earned-weightedSummary(book,a.row).earned).filter(x=>filter!=='passed'||weightedSummary(book,x.row).qualified);
  return `<table class="studio-score-table" aria-label="八项百分制成绩"><thead><tr><th class="rank-col">#</th><th>模型</th><th class="total-col">总分</th>${book.tasks.map((task,j)=>`<th class="metric-col">${e(taskLabel(task,j))}<small>满分 ${task.weight}</small></th>`).join('')}<th class="stars-col">本站星级</th><th><span class="sr-only">答卷</span></th></tr></thead><tbody>${rows.map(({m,row},i)=>{const s=weightedSummary(book,row);return `<tr><td class="rank-col">${String(i+1).padStart(2,'0')}</td><th scope="row">${modelLink(m,modelEffort(row))}</th><td class="total-col"><strong>${s.finalScore===null?'—':formatPoints(s.finalScore)}</strong></td>${row.items.map((x,j)=>`<td class="metric-col"><a class="metric ${statusClass(x)}" href="${x.score!==null&&x.evidenceLink?e(x.evidenceLink):taskHref(book.tasks[j])}" aria-label="${e(taskLabel(book.tasks[j],j))} ${x.score===null?'待评':formatPoints(points(x.score,book.tasks[j].weight))+' / '+book.tasks[j].weight+'分'}">${x.score===null?'—':formatPoints(points(x.score,book.tasks[j].weight))}</a></td>`).join('')}<td class="stars-col">${siteStars(book,row)}</td><td class="row-link"><a href="${url('model/'+m.id)}" aria-label="查看${e(m.name)}答卷">${arrowUpRight}</a></td></tr>`;}).join('')}${rows.length?'':'<tr><td colspan="13">当前筛选下暂无模型。</td></tr>'}</tbody></table>`;
}
export function studioQuestions(book){
  return book.tasks.map((t,i)=>`<a class="question-row" href="${taskHref(t)}"><span class="q-num">0${i+1}</span><div><span class="q-category">${e(taskLabel(t,i))}</span><h3>${e(t.agentKey?t.title:titles[i])}</h3></div><span class="q-weight">${t.weight}<small>分</small></span><span class="q-arrow" aria-hidden="true">${arrowRight}</span></a>`).join('');
}
function measurementOverview(data,book){
  const graded=book.models.filter(r=>weightedSummary(book,r).complete).length;
  if(book.agentTasks)return `${graded} 款已完成八题 · ${data.models.length-graded} 款待补齐或复核`;
  const measured=book.highSource?book.models.filter(row=>row.items.some(item=>item.measurement?.attempts?.length||(item.measurement?.collectionLabel&&item.measurement.status!=='not_run'))).length:graded;
  return measured===graded?`${measured} 款已测${data.models.length>measured?' · '+(data.models.length-measured)+' 款待测':''}`:`${measured} 款已实测 · ${graded} 款已评分 · ${measured-graded} 款待复核 · ${data.models.length-measured} 款待测`;
}
export function studioArchive(data,book,preferences={}){
  return `<div class="studio-home column-page">${pageHead('01 / 模型测评',book.agentTasks?'八题实测榜':'八道日常题，看看谁更靠谱。',`${measurementOverview(data,book)} · 满分 100`)}<div class="column-actions">${link('compare','模型对比')}${link('how','题目与评分')}${christmasLink()}${book.agentTasks?'':link('harness','三道工程实测')+codexLink()}</div><section class="column-section">${sectionHead('01','八项成绩')}<div class="score-scroll" tabindex="0" role="region" aria-label="八项成绩，可横向滚动">${studioScores(data,book,preferences)}</div><p class="column-note">${book.agentTasks?'前端和后端各按原始分 ÷ 10 折算。八题都出分才列入排名。':'日常榜总分只计下列八题。'}80 分合格，90 分优秀。</p><details class="column-disclosure"><summary>评分说明</summary><p>思考强度按请求时的设置标注。不同平台的同名档位各自定义。</p><p>原答卷与原分保留。除逐字改写外默认由助手初评，站长确认的单项另有标注。账单整活题按出题者约定的“1份”计分，票据层级与参考依据仍待核实，不代表整体图像能力。</p>${link('how','查看完整评分标准')}</details></section><div class="column-model-grid">${modelCards(data,book)}</div>${pendingModels(data,book)}<section class="column-section">${sectionHead('02','这次测了什么？','season/dynamic-pelican','动态鹈鹕题面')}<div id="question-list">${studioQuestions(book)}</div></section></div>`;
}
export function studioHome(data,book,{shortHighlights=[],agentRun}={}){
  const catalog=drawingCatalog(data,book);
  const featured=[catalog.visual.find(x=>x.model.id==='deepseek-v41-flash')||catalog.visual[0],catalog.visual.find(x=>x.model.id==='kimi-k3')||catalog.visual[1]].filter(Boolean);
  const leaders=rankedModels(data,book);
  const work=agentRun?.frontend.work;
  const score=(value)=>Number.isFinite(value)?'<strong>'+value+'<small> / 100</small></strong>':'';
  return `<div class="studio-home column-page column-home">
    <header class="home-intro"><h1>AI 到底有多靠谱？</h1>
      <p>同一道题给不同模型。看谁答得明白，谁把活儿整漂亮。</p>
      <div class="home-intro-links"><a class="home-primary" href="${url('results')}">看模型成绩 ${arrowRight}</a>${link('how','测试方法')}</div>
    </header>
    <div class="home-suites">
      <section class="home-suite"><header><h2>${book.agentTasks?'八题实测榜':'日常八题榜'}</h2><p>八题合计 100 分 · ${leaders.length} 款已评分</p></header>
        <ul class="home-result-list">${leaders.slice(0,3).map(({model,row,score:s})=>`<li><a href="${url('model/'+model.id)}"><span>${modelBadge(model.id)}<span>${e(model.name)}${modelEffort(row)}</span></span>${score(s.finalScore)}</a></li>`).join('')}</ul>
        <div class="home-suite-links">${link('results','完整榜单')}${link('compare','对比模型')}</div>
      </section>
      <section class="home-suite"><header><h2>短题实测</h2><p>推老板、修齿轮 · 每题单独计分</p></header>
        <ul class="home-result-list">${shortHighlights.map(({id,title,best,tied})=>`<li><a href="${url('season/'+id)}"><span>${e(title)}${Number.isFinite(best)?`<small>本题最高${tied>1?' · '+tied+' 款并列':''}</small>`:''}</span>${score(best)}${arrowRight}</a></li>`).join('')}</ul>
        <div class="home-suite-links">${link('season','短题与开发题')}</div>
      </section>
      <section class="home-suite home-suite-agent"><header><h2>Agent 挑战</h2><p>${book.agentTasks?'主榜第 2、3 题 · 原始百分制成绩':'前端做作品，后端跑测试'}</p></header>
        ${work?`<a class="home-agent-feature" href="${url('agent-challenge/'+work)}">
            <img src="art/christmas/${e(work)}.webp" alt="" width="760" height="570" decoding="async">
            <span><strong>圣诞树配乐</strong><small>${e(agentRun.name)} · ${agentRun.frontend.score} / 100</small>${effortBadge(agentRun.effort)}</span>${arrowRight}</a>
          <ul class="home-result-list"><li><a href="${url('agent-challenge/cache/'+agentRun.modelId)}"><span>并发缓存<small>${e(agentRun.name)}</small></span>${score(agentRun.backend.score)}${arrowRight}</a></li></ul>`:''}
        <div class="home-suite-links">${christmasLink()}${link('harness','工程实测')}</div>
      </section>
    </div>
    <section class="column-section home-feature">${sectionHead('','同画鹈鹕，差在哪？','works/visual','同题作品')}
      <div class="home-art-grid">${featured.map(entry=>artCard(entry,{compact:true})).join('')}</div>
      <div class="home-suite-links">${link('season/dynamic-pelican','动态鹈鹕题面')}</div>
    </section>
    <section class="column-section home-models">${sectionHead('',book.agentTasks?'全部模型 · 八题实测':'全部模型 · 日常八题','results','看各题得分')}
      <div class="column-model-grid">${modelCards(data,book)}</div>${pendingModels(data,book)}
      <div class="home-suite-links">${link('receipt','账单整活题')}</div>
    </section>
  </div>`;
}
export function studioWorks(data,book,taskId='',modelId=''){
  const catalog=drawingCatalog(data,book),valid=Object.hasOwn(artTasks,taskId);
  if(modelId){
    const entry=valid?catalog[taskId].find(x=>x.model.id===modelId):null;
    if(!entry)return `<div class="column-page">${pageHead('整活作品','没有找到这幅作品','请选择已发布的模型原作。')}${link('works','返回全部作品')}</div>`;
    return `<div class="column-page work-detail">${link('works/'+taskId,'返回'+artTasks[taskId].name)}${pageHead('整活作品 / 模型原作',e(entry.model.name),e(artTasks[taskId].prompt))}${artCard(entry,{detail:true})}${link(taskId,'同题全部答卷')}</div>`;
  }
  const selected=valid?[taskId]:Object.keys(artTasks);
  return `<div class="column-page">${pageHead('02 / 整活作品','模型的脑洞，直接上图。','看斑马和鹈鹕原画，也能播放模型的圣诞树。')}<nav class="column-tabs" aria-label="作品分类">${[['','斑马与鹈鹕'],['zebra','斑马奔跑'],['visual','鹈鹕骑车']].map(([id,name])=>`<a href="${url('works'+(id?'/'+id:''))}" ${id===(valid?taskId:'')?'aria-current="page"':''}>${name}</a>`).join('')}${link('agent-challenge','圣诞树')}</nav>${selected.map((id,i)=>`<section class="column-section work-collection">${sectionHead(String(i+1).padStart(2,'0'),artTasks[id].title,id,'题目与答卷')}<p class="column-note">${e(artTasks[id].prompt)}</p><div class="work-grid">${catalog[id].map(entry=>artCard(entry)).join('')||'<p>这道题暂时没有可展示的原作。</p>'}</div></section>`).join('')}</div>`;
}
export function studioRepairs(data,book,bank,{historicalEdit=false}={}){
  const catalog=drawingCatalog(data,book),issues=catalog.visual.filter(x=>x.item.score!==null&&x.item.score<2);
  const editIndex=book.tasks.findIndex(t=>t.id==='edit'),editTask=bank.tasks.find(t=>t.id==='edit');
  return `<div class="column-page">${pageHead('03 / 翻车修复','翻车现场，修改前后。','看鹈鹕画错在哪里，也看模型能不能按要求改字。')}<nav class="repair-section-links" aria-label="本页内容"><button type="button" data-repair-jump="repair-scenes">翻车现场 ${arrowRight}</button><button type="button" data-repair-jump="repair-edits">修改前后 ${arrowRight}</button></nav><section class="column-section repair-section" id="repair-scenes" tabindex="-1">${sectionHead('01','翻车现场','works/visual','同题作品')}<p class="column-note">画出来了，连接却没对上。以下原作尚无返工答卷。</p><div class="home-art-grid">${issues.map(entry=>artCard(entry,{issue:true})).join('')||'<p>本批没有已评分的绘画失误记录。</p>'}</div></section><section class="column-section repair-section" id="repair-edits" tabindex="-1">${sectionHead('02','修改前后','edit','完整题目与答卷')}<p class="column-note">${historicalEdit?'历史样例 · 旧版改字题':'只改时间，其他字别动 · 文字修改，不属于代码修复'}</p><div class="edit-brief"><span>修改要求</span><p>${e(editTask.prompts.at(-1))}</p></div><div class="edit-results">${data.models.filter(model=>model.report.runs[editIndex]?.outputs?.every(x=>typeof x==='string'&&x.trim())).map(model=>{
    const run=model.report.runs[editIndex],item=book.models.find(r=>r.modelId===model.id).items[editIndex];
    return `<article class="edit-result"><header>${modelLink(model,effortBadge(answerEffort(item)))}<span class="result-label ${statusClass(item)}">${e(status(item))} · ${item.score===null?'待评':formatPoints(points(item.score,book.tasks[editIndex].weight))} / ${book.tasks[editIndex].weight}</span></header><div class="edit-pair"><div><span>修改前 · 模型第一轮回答</span><p>${e(run.outputs[0])}</p></div><div><span>修改后 · 模型第二轮回答</span><p>${e(run.outputs.at(-1))}</p></div></div><details class="work-evidence"><summary>判分依据</summary><p>${e(item.weightedNote||item.reason)}</p>${link('model/'+model.id,'查看完整答卷')}</details></article>`;
  }).join('')}</div></section><aside class="repair-status"><span class="result-label pending">待实测</span><div><h2>鹈鹕返工待测</h2><p>本栏的鹈鹕原作还没有同一模型的返工答卷。</p>${link('harness','看已发布的代码修复实测')}</div></aside></div>`;
}
