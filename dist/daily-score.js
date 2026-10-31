const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const DAILY_RUBRIC=[
  {id:'purpose',name:'理解目的',full:'明确把车开去洗，理由正确且前后一致。',partial:'想到把车带去，但理由有遗漏；明确矛盾不算部分通过。',zero:'让人走去而不带车，或结论前后矛盾。'},
  {id:'reasoning',name:'推理纠错',full:'算出10点15，并明确纠正10点05，全文一致。',partial:'时间正确，但没有明确纠正用户。',zero:'时间算错，或仍附和错误时间。'},
  {id:'edit',name:'只改指定字',full:'最终回答去除首尾空白后，与目标句逐字一致。',partial:'指定时间改对，但改了其他字或增加解释。',zero:'指定时间未改对，或没有给出可用句子。'},
  {id:'memory',name:'多轮记忆',full:'最后一轮保留两人、合计1500元、不开车、周日晚回四项，不编新限制。',partial:'遗漏一至两项，但没有改错人数、预算、交通或回程。',zero:'改错原限制、编造新限制或遗漏三项以上。'},
  {id:'honesty',name:'不编信息',full:'三项待办、已知负责人和时间正确；所有未知项标“未说明”，允许附加原文解释。',partial:'事实正确无编造，但漏项或未用指定的“未说明”。',zero:'编造负责人、截止时间，或把已知信息分配错。'},
  {id:'visual',name:'画图连接',full:'完整交付合规SVG；脚踩踏板、身体坐车座、翅膀扶车把、车轮车架四处连接均正确。',partial:'完整交付可安全预览的SVG，但存在连接或输出格式问题。',zero:'未完整交付、不可安全预览，或主要结构明显不成立。'}
];
export function validateDailyScores(book,data,bank){
  const fail=()=>{throw Error('六项测试评分与本批答卷不匹配');};
  if(book?.schemaVersion!=='daily-six-scores-v1'||book.suiteId!==data.suiteId||book.origin!=='assistant-first-pass'||book.condition!=='default-8192-180'||book.models?.length!==data.models.length)fail();
  for(const [i,row] of book.models.entries()){
    const m=data.models[i];if(row.modelId!==m.id||row.sourceDigest!==m.sourceDigest||row.items?.length!==6)fail();
    for(const [j,item] of row.items.entries()){
      if(item.taskId!==bank.tasks[j].id||item.taskId!==DAILY_RUBRIC[j].id||![null,0,1,2].includes(item.score)||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>2000)fail();
      if(m.report.runs[j].status!=='complete'&&item.score!==0)fail();
      if(j===2&&item.score!==null&&((m.report.runs[j].outputs.at(-1)?.trim()===bank.tasks[j].exactAnswer)!==(item.score===2)))fail();
    }
  }return book;
}
export function suiteSummary(row){
  const graded=row.items.filter(x=>x.score!==null),passed=graded.filter(x=>x.score===2).length;
  return {total:graded.reduce((n,x)=>n+x.score,0),graded:graded.length,passed,fullPass:passed===6,complete:graded.length===6};
}
export const ratingBatchKey=data=>data.models.map(m=>m.sourceDigest).join('|');
export function readRatings(storage,key,data){
  try{const text=storage.getItem(key);if(!text||text.length>16384)return {};const value=JSON.parse(text);if(value.schemaVersion!==1||value.batchKey!==ratingBatchKey(data))return {};return Object.fromEntries(data.models.filter(m=>Number.isInteger(value.ratings?.[m.id])&&value.ratings[m.id]>=1&&value.ratings[m.id]<=5).map(m=>[m.id,value.ratings[m.id]]));}catch{return {};}
}
export function saveRatings(storage,key,data,ratings){try{storage.setItem(key,JSON.stringify({schemaVersion:1,batchKey:ratingBatchKey(data),ratings}));return true;}catch{return false;}}
export function personalStars(m,rating=0){return `<div class="suite-stars" role="group" aria-label="给${esc(m.name)}评星">${[1,2,3,4,5].map(n=>`<button type="button" data-suite-star="${esc(m.id)}" data-rating="${n}" aria-label="给${esc(m.name)}评${n}星" aria-pressed="${rating===n}" class="${n<=rating?'lit':''}">${n<=rating?'★':'☆'}</button>`).join('')}<small>${rating?rating+' / 5':'未评星'}</small></div>`;}
const gradeLabel=x=>x.score===null?'待评':x.score===2?'通过':x.score===1?'部分':'未通过';
export function suiteScoreDetails(row){return `<details class="suite-reasons"><summary>逐项得分与理由</summary><ul>${row.items.map((x,i)=>`<li><a href="#checkup/${esc(x.taskId)}">${esc(DAILY_RUBRIC[i].name)}</a> · ${x.score===null?'待评':x.score+' / 2'} · ${esc(x.reason)}</li>`).join('')}</ul></details>`;}
export function suiteRubric(){return `<details class="panel suite-rubric"><summary>评分标准 · 每项怎样拿到 2 分？</summary><div class="panel-body"><p>每项 2 分通过，1 分部分做到，0 分未通过。尚未评判的项显示“待评”，不按零分处理。六项均为 2 分才标整套通过，不用总分掩盖某一项失败。</p>${DAILY_RUBRIC.map(r=>`<h3>${esc(r.name)}</h3><p>2 分：${esc(r.full)}<br>1 分：${esc(r.partial)}<br>0 分：${esc(r.zero)}</p>`).join('')}<p>记忆题只给最后一轮的限制回忆打分；中间笑话等回答保留在原文，但不混入记忆分数。画图只计默认档完整交付，low / 32768 的补测单独查看。0 分若来自超时或输出耗尽，表示该条件下未交付，不等于模型一定不会画。</p><p>这是公开六项小测试的得分；除逐字改写外均为助手初评，未经过站长逐项确认，不代表总体能力排名。个人星评是主观偏好，与测试得分分开。</p></div></details>`;}
const scoreMark=m=>m.id.startsWith('deepseek')?'DS':m.id.startsWith('kimi')?'K':m.id.startsWith('glm')?'G':'M';
const taskShort=['目的','纠错','改字','记忆','诚实','画图'];
export function suiteScoreboard(data,book,{ratings={},filter='all',saved=true}={}){
  const rows=book.models.map((row,i)=>({row,m:data.models[i],s:suiteSummary(row)})),visible=rows.filter(x=>filter==='passed'?x.s.fullPass:filter==='starred'?!!ratings[x.m.id]:true);
  return `<section class="suite-board" aria-label="六项测试集成绩"><div class="section-heading"><div><span class="section-index">01 / SCORE SHEET</span><h2>模型成绩，一眼看清。</h2></div><span class="sheet-version">DAILY SIX <span>v1.0</span></span></div><div class="suite-toolbar"><div class="sheet-legend"><span><i class="legend-pass"></i>2 分通过</span><span><i class="legend-partial"></i>1 分部分</span><span><i class="legend-fail"></i>0 分未通过</span></div><label>显示 <select data-suite-filter aria-label="筛选测试集模型"><option value="all" ${filter==='all'?'selected':''}>全部模型</option><option value="passed" ${filter==='passed'?'selected':''}>整套通过</option><option value="starred" ${filter==='starred'?'selected':''}>我已评星</option></select></label></div><div class="score-table-head" aria-hidden="true"><span>模型 / MODEL</span><span>得分</span><span>通过项</span><div class="score-six-labels">${taskShort.map(t=>`<span>${t}</span>`).join('')}</div><span>我的星评</span><span></span></div><div class="suite-models">${visible.length?visible.map(({row,m,s})=>`<article class="suite-model" data-suite-model="${esc(m.id)}"><div class="score-row"><div class="score-identity"><span class="score-monogram model-${esc(m.id.split('-')[0])}" aria-hidden="true">${scoreMark(m)}</span><div><h3><a href="#checkup/model/${esc(m.id)}">${esc(m.name)}</a></h3><span class="score-provider">${esc(m.provider)} · 默认档</span></div></div><div class="suite-total"><strong>${s.complete?s.total:'待评'}</strong><span>${s.complete?'/12':'已评 '+s.graded+'/6'}</span></div><div class="score-passed"><strong>${s.passed}<small> / 6</small></strong><span>${s.fullPass?'整套通过':s.complete?'未全部通过':'待评完'}</span></div><div class="suite-items">${row.items.map((x,i)=>`<a href="#checkup/${esc(x.taskId)}" class="suite-item ${x.score===2?'is-pass':x.score===null?'is-pending':x.score===1?'is-partial':'is-fail'}" title="${esc(x.reason)}" aria-label="${esc(DAILY_RUBRIC[i].name)}：${x.score===null?'待评':x.score+'分，'+gradeLabel(x)}"><span>${taskShort[i]}</span><strong>${x.score===null?'—':x.score===2?'✓':x.score===1?'1':'×'}</strong></a>`).join('')}</div><div class="score-personal">${personalStars(m,ratings[m.id]||0)}</div><a class="score-open" href="#checkup/model/${esc(m.id)}" aria-label="查看${esc(m.name)}原始答卷">↗</a></div>${suiteScoreDetails(row)}</article>`).join(''):`<div class="sheet-empty">${filter==='passed'?'本批暂无整套通过的模型。可以切回全部模型，查看各项结果。':'还没有评星的模型。切回全部模型，点星即可标记。'}</div>`}</div><div class="sheet-footnote"><span class="footnote-number">*</span><p>本批默认档画图均未完整交付，<strong>${rows.filter(x=>x.s.fullPass).length} / ${rows.length} 个模型整套通过</strong>。low 档补测单独展示，不替换本表得分。</p><span class="review-stamp">助手初评</span></div><p id="suite-rating-status" class="rating-storage-note" role="status">${saved?'星评仅保存在当前浏览器；再次点击同一星级可清除。':'浏览器未允许保存；星评仅在当前页面有效。'}</p>${suiteRubric()}</section>`;
}
