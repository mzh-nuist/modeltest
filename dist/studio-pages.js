import {historicalReading} from './playful-season.js?v=20261101-short1';
import {modelBadge} from './model-identity.js?v=20261101-short1';
import {modelPicker} from './model-picker.js?v=20261101-short1';
import {weightedSummary,points,formatPoints,siteStars,RECEIPT_REVIEW_RULE} from './weighted-score.js?v=20261101-short1';
import {extractDrawing} from './completed-suite.js?v=20261101-short1';
import {checkupSVG} from './checkup-view.js?v=20261101-short1';
import {previewableCheckupSVG} from './checkup-data.js?v=20261101-short1';
import {arrowRight,arrowUpRight} from './ui-icons.js?v=20261101-short1';

const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=['理解需求','推理纠错','定点改字','多轮记忆','不乱编','画图连接','账单整活','斑马绘画'];
const titles=['洗车店只有 50 米，要开车吗？','9:40 出门，35 分钟后是 10:05？','只改时间，其他字一字不动','聊了几轮，还记得出游条件吗？','会议没说的，能不能不乱补？','鹈鹕骑车，脚和踏板要接对','辣椒炒肉，到底有几份？','在非洲草原上，画一只奔跑的斑马'];
const number=i=>String(i+1).padStart(2,'0');
const inline=value=>e(value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
const raw=value=>`<pre class="source-answer">${e(value||'本轮没有正文回答。')}</pre>`;
const scoreClass=item=>item.score===null?'pending':item.score===2?'pass':item.score===0?'fail':'partial';
const itemScore=(book,row,i)=>{const value=points(row.items[i].score,book.tasks[i].weight);return `<span class="item-score ${scoreClass(row.items[i])}"><strong>${value===null?'—':formatPoints(value)}</strong><small>/ ${book.tasks[i].weight}</small></span>`;};

// Only inert, escaped text formatting is supported. Exact text remains in the disclosure.
export function readableAnswer(value){
  if(!value)return '<p class="answer-empty">本轮没有正文回答。</p>';
  const blocks=String(value).trim().split(/\r?\n\s*\r?\n/);
  return blocks.map(block=>{
    const lines=block.split(/\r?\n/),cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim());
    if(lines.length>1&&lines.every(line=>line.trim().startsWith('|')&&line.trim().endsWith('|'))&&cells(lines[1]).every(cell=>/^:?-{3,}:?$/.test(cell))){
      const rows=lines.map(cells);
      if(rows.every(row=>row.length===rows[0].length))return `<div class="answer-table-wrap"><table class="answer-table"><thead><tr>${rows[0].map(cell=>`<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if(lines.every(line=>/^\s*[-*] /.test(line)))return `<ul>${lines.map(line=>`<li>${inline(line.replace(/^\s*[-*] /,''))}</li>`).join('')}</ul>`;
    return `<p>${inline(block).replace(/\r?\n/g,'<br>')}</p>`;
  }).join('');
}

function textAnswer(value){return `<div class="answer-reading">${readableAnswer(value)}</div><details class="answer-disclosure"><summary>查看原始文本</summary>${raw(value)}</details>`;}
function actualAnswer(model,book,row,i,bank){
  const item=row.items[i],run=model.report.runs[i],measurement=item.measurement;
  if(!measurement?.attempts?.length)return '<p class="answer-empty">尚未实测，暂无回答。</p>';
  const output=i<6?run?.outputs.at(-1):measurement?.output;
  if(i===5||i===7){
    const picture=extractDrawing(output),complete=i===5?run?.status==='complete':measurement?.status==='success';
    const preview=complete&&previewableCheckupSVG(picture.svg)?checkupSVG(picture.svg,'模型原作 · AI 生成'):'<p class="answer-empty">未交付完整、可预览的图形；原始返回保留在下方。</p>';
    return `<div class="answer-art">${preview}</div>${picture.fenced&&complete?'<p class="format-note">预览提取自原回答，格式问题已计入判分。</p>':''}<details class="answer-disclosure"><summary>查看原始 SVG 回答</summary>${raw(output)}</details>`;
  }
  const history=bank.tasks[i]?.prompts?.length>1?bank.tasks[i].prompts:null;
  return textAnswer(output)+(history?`<details class="answer-disclosure conversation-history"><summary>查看完整 ${history.length} 轮对话</summary>${history.map((prompt,j)=>`<div class="conversation-turn"><h4>第 ${j+1} 轮 · 提问</h4>${raw(prompt)}<h4>实际回答</h4>${raw(run.outputs[j])}</div>`).join('')}</details>`:'');
}

function scoringNotes(book,row,i){
  const item=row.items[i],reason=item.weightedNote||item.reason;
  const criteria=item.criteriaScores?.length?`<details class="answer-disclosure"><summary>分项评分</summary><ul>${item.criteriaScores.map((score,j)=>`<li><strong>${e(book.tasks[i].criteria[j].label)} · ${score.awarded} / ${book.tasks[i].criteria[j].max}</strong><p>${e(score.reason)}</p></li>`).join('')}</ul></details>`:'';
  return `<div class="answer-review"><span class="review-label">${item.score===null?'待测说明':item.reviewer==='site-owner'?'站长确认':'判分依据 · 助手初评'}</span><p>${e(reason)}</p>${criteria}</div>`;
}
function measurementNotes(item){const m=item.measurement;if(!m)return '';return `<details class="answer-disclosure"><summary>本题请求记录</summary><p>${e(m.condition)}<br>${e(m.apiModel)} · ${e(m.provider)}<br>${e(m.checkedAt)}<br>状态：${e(m.status)} ${e(m.error||'')}<br>原记录摘要：${e(m.sourceDigest)}</p></details>`;}
function rubric(task){return task.rubricType==='criteria'?`<ul>${task.criteria.map(c=>`<li><strong>${e(c.label)} · ${c.max} 分</strong><p>${e(c.anchors)}</p></li>`).join('')}</ul>`:`<p><strong>满分：</strong>${e(task.full)}<br><strong>${task.allowPartial?'部分得分':'需复核'}：</strong>${e(task.partial)}<br><strong>零分：</strong>${e(task.zero)}</p>${task.id==='receipt'?'<p>'+e(RECEIPT_REVIEW_RULE)+'</p>':''}`;}
function taskPrompt(task,bankTask){
  const prompts=bankTask?.prompts||task.prompts;
  if(task.id==='receipt')return `<p>${e(prompts[0])}</p><a class="receipt-original" href="assets/receipt-chilli-pork.png" target="_blank" rel="noopener"><img src="assets/receipt-chilli-pork.png" width="1320" height="1149" alt="本题使用的完整餐厅账单原图" loading="lazy"><span>打开账单原图 ${arrowUpRight}</span></a>`;
  if(prompts.length===1&&task.id!=='visual'&&task.id!=='zebra')return `<p>${e(prompts[0])}</p>`;
  return `<p>${e(task.title)}</p><details class="answer-disclosure"><summary>查看完整${prompts.length>1?' '+prompts.length+' 轮':''}提问</summary>${prompts.map((p,j)=>`${prompts.length>1?'<h4>第 '+(j+1)+' 轮</h4>':''}${raw(p)}`).join('')}</details>`;
}
function answerContent(model,book,row,i,bank){
  return actualAnswer(model,book,row,i,bank)+historicalReading(book.tasks[i],row.items[i])+scoringNotes(book,row,i)+(i>=6?measurementNotes(row.items[i]):'');
}
function taskSection(models,book,bank,i){
  const task=book.tasks[i],compare=models.length===2;
  const heading=`<div class="case-heading"><span class="case-number">${number(i)}</span><div><p>${e(i===6?'账单整活题':names[i])}</p><h2>${e(titles[i])}</h2></div>${compare?`<span class="case-weight">满分 ${task.weight} 分</span>`:itemScore(book,book.models.find(r=>r.modelId===models[0].id),i)}</div>`;
  const question=`${taskPrompt(task,bank.tasks[i])}<details class="answer-disclosure"><summary>评分标准</summary>${rubric(task)}</details>`;
  const answers=models.map(model=>{const row=book.models.find(r=>r.modelId===model.id);return `<article class="answer-pane" aria-label="${e(model.name)} · ${e(names[i])}">${compare?`<header class="answer-author"><a href="#checkup/model/${e(model.id)}">${modelBadge(model.id)}<span>${e(model.name)}</span></a>${itemScore(book,row,i)}</header>`:`<p class="answer-kind">${row.items[i].measurement?.attempts?.length?'模型原回答 · AI 生成':'等待实测'}</p>`}${answerContent(model,book,row,i,bank)}</article>`;}).join('');
  return `<section class="answer-section" id="answer-${e(task.id)}" tabindex="-1">${heading}${compare?`<details class="shared-question"><summary>查看题目与评分标准</summary><div class="question-content">${question}</div></details><div class="answer-columns">${answers}</div>`:`<div class="detail-answer-layout"><aside class="question-content"><span class="question-label">测试题目</span>${question}</aside>${answers}</div>`}</section>`;
}

function totalScore(book,row){const score=weightedSummary(book,row);if(!score.graded)return '<div class="page-total pending-total"><div><strong>待测</strong></div><p>暂无成绩 · 不参与排名</p></div>';return `<div class="page-total"><div><strong>${formatPoints(score.earned)}</strong><span>/ 100${score.complete?'':' 暂得'}</span></div><p>${e(score.grade)}${score.complete?'':' · 已评 '+score.graded+' / '+book.tasks.length+' 项'}</p></div>`;}
function navigation(book,row=null){return `<nav class="task-score-nav${row?' has-scores':''}" aria-label="跳到本页测试答卷">${book.tasks.map((t,i)=>`<button type="button" data-answer-jump="${e(t.id)}" aria-label="跳到${e(names[i])}${row?'，'+(row.items[i].score===null?'待测':formatPoints(points(row.items[i].score,t.weight))+' / '+t.weight+'分'):''}"><span class="jump-title"><small>${number(i)}</small>${e(names[i])}</span>${row?itemScore(book,row,i):''}</button>`).join('')}</nav>`;}
const breadcrumb=label=>`<div class="page-breadcrumb"><a href="#checkup/results">模型测评</a><span aria-hidden="true">/</span><span>${label}</span></div>`;

export function studioModelPage(data,bank,book,id,preferences={},evidence=''){
  const model=data.models.find(m=>m.id===id),row=book.models.find(r=>r.modelId===id),other=data.models.find(m=>m.id!==id);
  if(!model||!row)return '';
  return `<div class="studio-pages model-profile">${breadcrumb('模型详情')}<section class="model-overview"><div class="model-intro"><h1>${modelBadge(id)}<span>${e(model.name)}</span></h1><div class="model-overview-meta">${siteStars(book,row)}<span>${book.tasks.length} 项日常挑战</span></div><div class="page-actions"><a class="page-action primary" href="#checkup/compare/${e(id)}/${e(other.id)}">和其他模型比一比 ${arrowRight}</a></div></div>${totalScore(book,row)}</section>${model.pendingReason?`<p class="model-pending-reason">${e(model.pendingReason)}</p>`:''}${navigation(book,row)}<div class="answers-intro"><h2>${weightedSummary(book,row).graded?'它到底怎么答的？':'准备测哪些题？'}</h2><span>${weightedSummary(book,row).graded?'原回答 · 得分 · 判分依据':'同一套题目与评分标准'}</span></div>${book.tasks.map((_,i)=>taskSection([model],book,bank,i)).join('')}<section class="page-evidence"><h2>测试记录</h2>${evidence}</section></div>`;
}

export function studioComparePage(data,bank,book,one,two,evidence=''){
  const models=[one,two];
  return `<div class="studio-pages model-comparison">${breadcrumb('模型对比')}<section class="compare-intro"><div><h1>两个模型，同题较量。</h1><p>从分数到原回答，放在一起看。</p></div><a class="page-action" href="#checkup/results">全部成绩 ${arrowUpRight}</a></section><div class="compare-overview">${models.map((model,i)=>{const row=book.models.find(r=>r.modelId===model.id);return `<section class="compare-model-summary" aria-label="模型 ${i===0?'A':'B'} 概览">${modelPicker(data.models,model.id,i)}<div class="compare-model-score">${totalScore(book,row)}<div>${siteStars(book,row)}<a class="page-text-link" href="#checkup/model/${e(model.id)}">完整答卷 ${arrowUpRight}</a></div></div></section>`;}).join('')}</div>${navigation(book)}${book.tasks.map((_,i)=>taskSection(models,book,bank,i)).join('')}<section class="page-evidence"><h2>测试记录</h2>${evidence}</section></div>`;
}

export function bindAnswerNavigation(main){
  main.addEventListener('click',event=>{
    const button=event.target.closest('[data-answer-jump]');
    if(!button||!main.contains(button)||! /^[a-z]+$/.test(button.dataset.answerJump))return;
    const section=main.querySelector('#answer-'+button.dataset.answerJump);if(!section)return;
    section.scrollIntoView({block:'start',behavior:main.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    section.focus({preventScroll:true});
    main.querySelectorAll('[data-answer-jump]').forEach(el=>{if(el===button)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
  });
}
