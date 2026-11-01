import {arrowUpRight,arrowRight} from './ui-icons.js?v=20261101-short1';
import {weightedSummary,points,formatPoints,siteStars} from './weighted-score.js?v=20261101-short1';
import {extractDrawing} from './completed-suite.js?v=20261101-short1';
import {previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
import {modelBadge} from './model-identity.js?v=20261101-short1';

const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=(route='')=>'#checkup'+(route?'/'+route:'');
const shortNames=['理解需求','推理纠错','定点改字','多轮记忆','不乱编','画图连接','账单整活','斑马绘画'];
const titles=['洗车店只有 50 米，要开车吗？','9:40 出门，35 分钟后是 10:05？','只改时间，其他字一字不动','聊了几轮，还记得出游条件吗？','会议没说的，能不能不乱补？','鹈鹕骑车，脚和踏板要接对','辣椒炒肉，到底有几份？','在非洲草原上，画一只奔跑的斑马'];
const artTasks={zebra:{name:'斑马奔跑',title:'草原上，谁的斑马跑起来了？',prompt:'画一只在非洲稀树草原上奔跑的斑马。'},visual:{name:'鹈鹕骑车',title:'会画鸟，也要会骑车。',prompt:'画鹈鹕骑自行车：脚踩踏板、翅膀扶把、坐在车座上。'}};
const link=(route,label)=>`<a class="column-link" href="${url(route)}">${label} ${arrowRight}</a>`;
const modelLink=m=>`<a class="column-model" href="${url('model/'+m.id)}">${modelBadge(m.id)}<span>${e(m.name)}</span></a>`;
const pageHead=(label,title,description)=>`<header class="column-heading"><div><p class="column-kicker">${label}</p><h1>${title}</h1><p>${description}</p></div></header>`;
const sectionHead=(index,title,route,label)=>`<div class="column-section-head"><h2><span>${index}</span>${title}</h2>${route?link(route,label):title==='八项成绩'?'<span class="score-scroll-hint" aria-hidden="true">← 左右滑动 →</span>':''}</div>`;
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
  return `<article class="work-card${issue?' issue-card':''}${compact?' home-work-card':''}"><header>${modelLink(model)}${compact?'':`<span class="result-label ${statusClass(item)}">${e(status(item))}</span>`}</header>${picture}<div class="work-caption"><h3>${compact?e(status(item)):e(artTasks[task.id].name)}</h3><span class="work-score"><strong>${score===null?'待评':formatPoints(score)}</strong> / ${task.weight}</span></div>${issue?`<p class="issue-observation">${e(item.weightedNote||item.reason)}</p><span class="repair-pending">尚无返工答卷</span>`:''}${compact?'':`<details class="work-evidence"><summary>判分与原回答</summary><p>${e(item.weightedNote||item.reason)}</p>${originalText(item.measurement.output)}${link('model/'+model.id,'完整答卷')}</details>`}</article>`;
}
function modelCards(data,book){
  return data.models.map(model=>({model,row:book.models.find(r=>r.modelId===model.id)})).filter(({row})=>weightedSummary(book,row).complete).sort((a,b)=>weightedSummary(book,b.row).earned-weightedSummary(book,a.row).earned).map(({model,row})=>{
    const score=weightedSummary(book,row);
    return `<a class="column-model-card" href="${url('model/'+model.id)}"><span class="column-model">${modelBadge(model.id)}<span>${e(model.name)}</span></span><span class="model-card-score"><strong>${score.finalScore===null?'—':formatPoints(score.finalScore)}</strong><small>/ 100</small></span><span class="model-card-footer">${siteStars(book,row)}<span class="card-open">看答卷 ${arrowRight}</span></span></a>`;
  }).join('');
}
function pendingModels(data,book){
  const models=data.models.filter(model=>!weightedSummary(book,book.models.find(r=>r.modelId===model.id)).complete);
  if(!models.length)return '';
  return `<section class="pending-models" aria-label="待测与待复核模型"><h2>待测 / 待复核模型 <span>${models.length}</span></h2><div class="pending-model-grid">${models.map(model=>`<a class="pending-model-card" href="${url('model/'+model.id)}"><span class="column-model">${modelBadge(model.id)}<span>${e(model.name)}</span></span><span class="pending-model-note">${e(model.pendingReason||'答卷尚未完成，暂不排名。')}</span><span class="pending-open">${book.highSource?.models.find(m=>m.modelId===model.id)?.requests>0?'待复核':'待测'} ${arrowRight}</span></a>`).join('')}</div></section>`;
}
export function studioScores(data,book,{filter='all'}={}){
  const rows=data.models.map(m=>({m,row:book.models.find(r=>r.modelId===m.id)})).filter(({row})=>weightedSummary(book,row).complete).sort((a,b)=>weightedSummary(book,b.row).earned-weightedSummary(book,a.row).earned).filter(x=>filter!=='passed'||weightedSummary(book,x.row).qualified);
  return `<table class="studio-score-table" aria-label="八项百分制成绩"><thead><tr><th class="rank-col">#</th><th>模型</th><th class="total-col">总分</th>${shortNames.map((n,j)=>`<th class="metric-col">${n}<small>满分 ${book.tasks[j].weight}</small></th>`).join('')}<th class="stars-col">本站星级</th><th><span class="sr-only">答卷</span></th></tr></thead><tbody>${rows.map(({m,row},i)=>{const s=weightedSummary(book,row);return `<tr><td class="rank-col">0${i+1}</td><th scope="row">${modelLink(m)}</th><td class="total-col"><strong>${s.finalScore===null?'—':formatPoints(s.finalScore)}</strong></td>${row.items.map((x,j)=>`<td class="metric-col"><a class="metric ${statusClass(x)}" href="${url(x.taskId)}" aria-label="${e(shortNames[j])} ${x.score===null?'待评':formatPoints(points(x.score,book.tasks[j].weight))+' / '+book.tasks[j].weight+'分'}">${x.score===null?'—':formatPoints(points(x.score,book.tasks[j].weight))}</a></td>`).join('')}<td class="stars-col">${siteStars(book,row)}</td><td class="row-link"><a href="${url('model/'+m.id)}" aria-label="查看${e(m.name)}答卷">${arrowUpRight}</a></td></tr>`;}).join('')}${rows.length?'':'<tr><td colspan="13">当前筛选下暂无模型。</td></tr>'}</tbody></table>`;
}
export function studioQuestions(book){
  return book.tasks.map((t,i)=>`<a class="question-row" href="${url(t.id)}"><span class="q-num">0${i+1}</span><div><span class="q-category">${e(shortNames[i])}</span><h3>${e(titles[i])}</h3></div><span class="q-weight">${t.weight}<small>分</small></span><span class="q-arrow" aria-hidden="true">${arrowRight}</span></a>`).join('');
}
function measurementOverview(data,book){
  const graded=book.models.filter(r=>weightedSummary(book,r).complete).length;
  const measured=book.highSource?book.highSource.models.filter(m=>m.requests>0).length:graded;
  return measured===graded?`${measured} 款已测 · ${data.models.length-measured} 款待测`:`${measured} 款已实测 · ${graded} 款已评分 · ${measured-graded} 款待复核 · ${data.models.length-measured} 款待测`;
}
export function studioArchive(data,book,preferences={}){
  return `<div class="studio-home column-page">${pageHead('01 / 模型测评','同一道题，看看谁更靠谱。',`${measurementOverview(data,book)} · 满分 100`)}<div class="column-actions">${link('compare','模型对比')}${link('how','题目与评分')}${link('season/dynamic-pelican','新题 · 动态鹈鹕')}${link('season/boss-sokoban','新实测 · 推老板')}${link('season/gear-scam','新实测 · 齿轮诈骗')}</div><div class="column-model-grid">${modelCards(data,book)}</div>${pendingModels(data,book)}<section class="column-section">${sectionHead('01','八项成绩')}<div class="score-scroll" tabindex="0" role="region" aria-label="八项成绩，可横向滚动">${studioScores(data,book,preferences)}</div><p class="column-note">分数只算这套题。80 分合格，90 分优秀；星级对应本站成绩。</p><details class="column-disclosure"><summary>评分说明</summary><p>原答卷与原分保留。除逐字改写外默认由助手初评，站长确认的单项另有标注。账单整活题按出题者约定的“1份”计分，票据层级与参考依据仍待核实，不代表整体图像能力。</p>${link('how','查看完整评分标准')}</details></section><section class="column-section">${sectionHead('02','这次测了什么？')}<div id="question-list">${studioQuestions(book)}</div></section></div>`;
}
export function studioHome(data,book){
  const catalog=drawingCatalog(data,book);
  const featured=[catalog.visual.find(x=>x.model.id==='deepseek-v41-flash')||catalog.visual[0],catalog.visual.find(x=>x.model.id==='kimi-k3')||catalog.visual[1]].filter(Boolean);
  return `<div class="studio-home column-page column-home">${pageHead('国产 AI 为主 / 实测与整活','本事怎么样，<span>拿出来看看。</span>','看作品，看表现，也看它们怎么翻车。')}<nav class="home-quick-links" aria-label="三个栏目"><a href="${url('results')}"><strong>模型测评</strong><span>${data.models.length} 款模型 ${arrowRight}</span></a><a href="${url('works')}"><strong>整活作品</strong><span>${catalog.zebra.length+catalog.visual.length} 幅原作 ${arrowRight}</span></a><a href="${url('repairs')}"><strong>翻车修复</strong><span>看修改前后 ${arrowRight}</span></a></nav><a class="season-link" href="${url('season/dynamic-pelican')}">新题 · 鹈鹕骑车动态挑战 ${arrowRight}</a><div class="column-actions"><a href="#checkup/season/boss-sokoban">新实测 · 推老板进工位 →</a><a href="#checkup/season/gear-scam">新实测 · 齿轮诈骗 →</a></div><section class="home-feature">${sectionHead('01','同画鹈鹕，差在哪？','works/visual','同题作品')}<div class="home-art-grid">${featured.map(entry=>artCard(entry,{eager:true,compact:true})).join('')}</div></section><section class="column-section home-models">${sectionHead('02','这次，谁更靠谱？','results','全部成绩')}<div class="column-model-grid">${modelCards(data,book)}</div><p class="column-note">分数只算这套题。原回答与判分依据均可查看。</p>${pendingModels(data,book)}</section></div>`;
}
export function studioWorks(data,book,taskId='',modelId=''){
  const catalog=drawingCatalog(data,book),valid=Object.hasOwn(artTasks,taskId);
  if(modelId){
    const entry=valid?catalog[taskId].find(x=>x.model.id===modelId):null;
    if(!entry)return `<div class="column-page">${pageHead('整活作品','没有找到这幅作品','请选择已发布的模型原作。')}${link('works','返回全部作品')}</div>`;
    return `<div class="column-page work-detail">${link('works/'+taskId,'返回'+artTasks[taskId].name)}${pageHead('整活作品 / 模型原作',e(entry.model.name),e(artTasks[taskId].prompt))}${artCard(entry,{detail:true})}${link(taskId,'同题全部答卷')}</div>`;
  }
  const selected=valid?[taskId]:Object.keys(artTasks);
  return `<div class="column-page">${pageHead('02 / 整活作品','模型的脑洞，直接上图。','同一道题，各有各的画法。')}<nav class="column-tabs" aria-label="作品分类">${[['','全部作品'],['zebra','斑马奔跑'],['visual','鹈鹕骑车']].map(([id,name])=>`<a href="${url('works'+(id?'/'+id:''))}" ${id===(valid?taskId:'')?'aria-current="page"':''}>${name}</a>`).join('')}</nav>${selected.map((id,i)=>`<section class="column-section work-collection">${sectionHead(String(i+1).padStart(2,'0'),artTasks[id].title,id,'题目与答卷')}<p class="column-note">${e(artTasks[id].prompt)}</p><div class="work-grid">${catalog[id].map(entry=>artCard(entry)).join('')||'<p>这道题暂时没有可展示的原作。</p>'}</div></section>`).join('')}</div>`;
}
export function studioRepairs(data,book,bank){
  const catalog=drawingCatalog(data,book),issues=catalog.visual.filter(x=>x.item.score!==null&&x.item.score<2);
  const editIndex=book.tasks.findIndex(t=>t.id==='edit'),editTask=bank.tasks.find(t=>t.id==='edit');
  return `<div class="column-page">${pageHead('03 / 翻车修复','翻车现场，修改前后。','绘画失误与文字修改，分开看。')}<nav class="repair-section-links" aria-label="本页内容"><button type="button" data-repair-jump="repair-scenes">翻车现场 ${arrowRight}</button><button type="button" data-repair-jump="repair-edits">修改前后 ${arrowRight}</button></nav><section class="column-section repair-section" id="repair-scenes" tabindex="-1">${sectionHead('01','翻车现场','works/visual','同题作品')}<p class="column-note">画出来了，连接却没对上。以下原作尚无返工答卷。</p><div class="home-art-grid">${issues.map(entry=>artCard(entry,{issue:true})).join('')||'<p>本批没有已评分的绘画失误记录。</p>'}</div></section><section class="column-section repair-section" id="repair-edits" tabindex="-1">${sectionHead('02','修改前后','edit','完整题目与答卷')}<p class="column-note">只改时间，其他字别动 · 文字修改，不属于代码修复</p><div class="edit-brief"><span>修改要求</span><p>${e(editTask.prompts.at(-1))}</p></div><div class="edit-results">${data.models.filter(model=>model.report.runs[editIndex]?.outputs?.every(x=>typeof x==='string'&&x.trim())).map(model=>{
    const run=model.report.runs[editIndex],item=book.models.find(r=>r.modelId===model.id).items[editIndex];
    return `<article class="edit-result"><header>${modelLink(model)}<span class="result-label ${statusClass(item)}">${e(status(item))} · ${item.score===null?'待评':formatPoints(points(item.score,book.tasks[editIndex].weight))} / ${book.tasks[editIndex].weight}</span></header><div class="edit-pair"><div><span>修改前 · 模型第一轮回答</span><p>${e(run.outputs[0])}</p></div><div><span>修改后 · 模型第二轮回答</span><p>${e(run.outputs.at(-1))}</p></div></div><details class="work-evidence"><summary>判分依据</summary><p>${e(item.weightedNote||item.reason)}</p>${link('model/'+model.id,'查看完整答卷')}</details></article>`;
  }).join('')}</div></section><aside class="repair-status"><span class="result-label pending">待实测</span><div><h2>真正的返工，还要再测</h2><p>还没有代码修 bug 或作品返工记录。同一模型改正同一个错误后，再展示修复过程。</p></div></aside></div>`;
}
