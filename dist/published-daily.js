import {answerEffort,effortBadge} from './thinking-effort.js?v=20261125-effort1';
import {validateShortBank,validateShortResults,shortTaskPage,shortOverview,shortHighlights,bindShortChallenges} from './short-challenges.js?v=20261125-effort1';
import {mergeHighExpanded} from './high-expanded.js?v=20261125-effort1';
import {validatePlayfulSeason,seasonPage,bindSeason} from './playful-season.js?v=20261123-suite2';
import {studioModelPage,studioComparePage,bindAnswerNavigation} from './studio-pages.js?v=20261125-effort1';
import {siteNotesPage} from './site-notes.js?v=20261127-links1';
import {modelBadge} from './model-identity.js?v=20261118-models4';
import {studioHome,studioArchive,studioWorks,studioRepairs} from './studio-home.js?v=20261125-effort1';
import {createCodexComparison,loadComparisonBatches} from './codex-comparison.js?v=20261125-effort1';
import {publishCodexMain,publishCodexShort} from './codex-publication.js?v=20261125-effort1';
import {createChristmasChallenge,projectAgentTasks} from './christmas-challenge.js?v=20261125-effort1';
import {createHarnessEval} from './harness-eval.js?v=20261125-effort1';
import {modelPicker,bindModelPickers} from './model-picker.js?v=20261118-models4';
import {validateHighSuite,projectHighSuite,highPanel} from './high-suite.js?v=20261125-effort1';
import {EFFORTS,validateEffortMatrix,projectEffortMatrix,effortPanel,effortOverview} from './effort-matrix.js?v=20261125-effort1';
import {extractDrawing,validateCompletedSuite,completionCard,completionComparison,zebraPage} from './completed-suite.js?v=20261125-effort1';
import {validateWeightedSuite,weightedScoreboard,weightedSummary,weightedModelSummary,weightedDetails,weightedRubric,weightedGrade,points,formatPoints} from './weighted-score.js?v=20261123-suite2';
import {receiptTeaser,createReceiptController} from './receipt-test.js?v=20261125-effort1';
import {createAudienceController} from './traffic.js?v=20261124-goat1';
import {validateCheckupBank,validateCheckupReport,previewableCheckupSVG,parseCheckupJSON} from './checkup-data.js?v=20261101-short1';
import {checkupSVG} from './checkup-view.js?v=20261101-short1';
import {validateDailyScores,suiteScoreboard,suiteScoreDetails,suiteSummary,personalStars,readRatings,saveRatings,suiteRubric} from './daily-score.js?v=20261101-short1';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=message=>{throw Error(message)};
const fields=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail('发布数据字段不符合约定');};
const text=(x,max=100000)=>{if(typeof x!=='string'||x.length>max)fail('发布文字类型或长度错误');};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const ids=['deepseek-v41-flash','kimi-k31-pro','kimi-k3','glm53-flash','minimax-m31-flash'];
export function validatePublishedDaily(data,bank){
  validateCheckupBank(bank);
  fields(data,['schemaVersion','suiteId','publishedAt','origin','reviewer','totalRequests','successfulRequests','models']);
  if(data.schemaVersion!=='published-daily-v1'||data.suiteId!==bank.suiteId||data.origin!=='publisher-local-api-collection'||data.reviewer!=='assistant-first-pass'||!Number.isFinite(Date.parse(data.publishedAt)))fail('发布来源标记错误');
  if(!Array.isArray(data.models)||data.models.length!==5)fail('本批应为五个模型');
  let calls=0,successes=0;
  for(const [i,m] of data.models.entries()){
    fields(m,['id','name','apiModel','provider','checkedAt','report','defaultRequests','defaultSuccessfulRequests','sourceDigest','checks','textNote','supplement']);
    if(m.id!==ids[i]||m.provider!=='CommandCode'||!Number.isFinite(Date.parse(m.checkedAt)))fail('模型或日期错误');
    for(const k of ['name','apiModel','textNote'])text(m[k],2000);
    if(!/^[a-f0-9]{64}$/.test(m.sourceDigest)||!integer(m.defaultRequests)||!integer(m.defaultSuccessfulRequests)||m.defaultSuccessfulRequests>m.defaultRequests)fail('采集计数错误');
    validateCheckupReport(m.report,bank);
    if(m.report.kind!=='imported'||m.report.checkedAt!==m.checkedAt||m.report.runs.some(r=>r.review!==null))fail('采集原文不得伪造用户确认');
    if(!Array.isArray(m.checks)||m.checks.length!==6)fail('检查项错误');
    m.checks.forEach((c,j)=>{fields(c,['taskId','label','note','origin']);if(c.taskId!==bank.tasks[j].id||c.origin!==(j===2?'rule':'assistant')||!['未完成','主要内容通过','回答前后矛盾'].includes(c.label))fail('复核来源错误');text(c.label,100);text(c.note,2000);if((m.report.runs[j].status!=='complete')!==(c.label==='未完成'))fail('未完成回答不能标为通过');});
    if(m.report.runs[2].outputs.at(-1)?.trim()!==bank.tasks[2].exactAnswer)fail('精确题判断与原文不一致');
    const s=m.supplement;fields(s,['status','error','output','reasoningEffort','maxOutputTokens','timeoutSeconds','note']);
    if(!['success','error','timeout'].includes(s.status)||s.reasoningEffort!=='low'||s.maxOutputTokens!==32768||s.timeoutSeconds!==180)fail('补测条件错误');
    if(s.error!==null)text(s.error,200);text(s.output);text(s.note,2000);
    calls+=m.defaultRequests+1;successes+=m.defaultSuccessfulRequests+(s.status==='success'?1:0);
  }
  if(data.totalRequests!==calls||data.successfulRequests!==successes)fail('整批计数不一致');return data;
}
const date=iso=>iso?new Date(iso).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（UTC+8）':'尚未采集';
const header=(title,sub,actions='',modelId=null)=>`<div class="page-head"><div><div class="eyebrow">国产 AI 模型实测 / 逐风03 发起</div><h1${modelId?' class="model-title"':''}>${modelId?modelBadge(modelId):''}<span>${e(title)}</span></h1><p class="subtitle">${e(sub)}</p></div><div class="head-actions">${actions}</div></div>`;
const tag=(label,type='review')=>`<span class="checkup-status checkup-${type}">${e(label)}</span>`;
const pre=(v,isAnswer=true)=>`${isAnswer?'<p class="evidence-meta">模型原回答 · AI 生成</p>':''}<pre class="checkup-answer">${e(v||'本轮没有正文回答。')}</pre>`;
const source=data=>`<p class="checkup-source"><span class="dot"></span> 实测答卷 · ${data.highOnly?data.models.filter(m=>m.report.runs.some(r=>r.status!=='not_run')).length+' / '+data.models.length:data.models.length} 个型号 · API ${data.totalRequests} 次请求${data.codexRequests?' · Codex '+data.codexRequests+' 轮':''} · ${data.highOnly?'日常榜批次':'历史批次'} ${e(data.codexDate||date(data.publishedAt))}</p><p class="evidence-meta">改字题逐字核对；其他文字和图形默认由助手初审；站长已复核的单项标注“站长确认”。单次样本不代表总体能力或长期降智。</p>`;
const sourceDetails=data=>`<details class="publication-evidence"><summary>数据来源与评审说明</summary>${source(data)}</details>`;
const condition=m=>m.collectionLabel?`<details class="pub-conditions"><summary>${e(m.collectionLabel)} 测试设置</summary><p>型号：${e(m.apiModel)} · ${e(m.checkedAt)}<br>${e(m.condition)}</p><a href="${e(m.collectionFile)}" download>下载本批原答卷 →</a></details>`:m.highOnly?`<details class="pub-conditions"><summary>HIGH测试入口与设置</summary><p>型号：${e(m.apiModel)}；服务商：${e(m.provider)}。<br>仅high，无客户端总时长限制。最大输出：${m.outputLimit===null?'未核实，因此未发送':m.outputLimit+' token（'+(m.outputLimitAuthority==='model-publisher'?'原厂文档':'服务商公开配置')+'）'+(m.outputPolicy==='budget-bounded-output'?'；本轮按预算逐次分配，实际 '+(m.actualOutputCaps.length?Math.min(...m.actualOutputCaps)+'—'+Math.max(...m.actualOutputCaps):'未发送'):'')}。<br>每项独立会话，多轮带本档真实历史；账单附原PNG。源文件摘要：${e(m.sourceDigest)}</p></details>`:m.selectedEffort?`<details class="pub-conditions"><summary>本档测试入口与设置</summary><p>型号：${e(m.apiModel)}；服务商：${e(m.provider)}。<br>当前查看：${e(m.selectedEffort)}；共同输出上限16384、300秒超时、无重试。<br>每项新会话，多轮题只携带本档真实历史；账单附原PNG。<br>参数已发送，上游实际强度未独立验证。源答卷摘要：${e(m.sourceDigest)}</p></details>`:`<details class="pub-conditions"><summary>测试入口与设置</summary><p>请求型号：${e(m.apiModel)}<br>服务商：${e(m.provider)}；日期：${e(date(m.checkedAt))}<br>首轮：服务商默认推理，输出上限 8192，180 秒超时，无重试。<br>画图补测：low 推理档，输出上限 32768，180 秒超时，单独一次。<br>多轮题携带前面每轮真实回答。源答卷摘要：<code>${e(m.sourceDigest.slice(0,16))}…</code>（用于追溯文件，不是上游身份认证）</p></details>`;
const verdict=(m,i,book=null)=>{const score=book?.models.find(x=>x.modelId===m.id)?.items[i];if(score&&book.schemaVersion.startsWith('daily-weighted-')){const row=book.models.find(x=>x.modelId===m.id);const grade=weightedGrade(book,row,i);return tag(grade+' 分'+(score.score===null?'':score.score===2?' · 达成要求':score.score>0?' · 部分达成':' · 未达要求'),score.score===2?'normal':'review');}if(score)return tag(score.score===null?'待评':score.score+' / 2 · '+(score.score===2?'通过':score.score===1?'部分':'未通过'),score.score===2?'normal':'review');const c=m.checks[i];return c.label==='未完成'?tag('未完整交付'):c.label==='回答前后矛盾'?tag('回答矛盾','wrong'):tag(c.origin==='rule'?'逐字一致':'初审主要正常','normal');};
function original(task,row){
  if(task.prompts.length===1)return pre(row.outputs[0]);
  return pre(row.outputs.at(-1))+`<details><summary>查看完整 ${task.prompts.length} 轮对话</summary>${task.prompts.map((p,i)=>`<h4>第 ${i+1} 轮提问</h4>${pre(p,false)}<h4>实际回答</h4>${pre(row.outputs[i])}`).join('')}</details>`;
}
export function supplementalPicture(m){
  if(m.selectedEffort){const r=m.report.runs[5];if(r.status==='not_run')return '<p class="checkup-warning">本档本题尚未采集。</p>';const pic=extractDrawing(r.outputs[0]);return `<h3>${e(m.selectedEffort)} · 本档原始画图答卷</h3>${r.status==='complete'&&previewableCheckupSVG(pic.svg)?`${pic.fenced?'<p class="checkup-warning">原文附带额外说明或围栏；仅提取唯一SVG预览，格式问题保留。</p>':''}${checkupSVG(pic.svg)}`:'<p class="checkup-warning">本档未交付完整、安全可预览的图形。</p>'}<details><summary>查看本档原始回答</summary>${pre(r.outputs[0])}</details>`;}
  const s=m.supplement;let svg=s.output,extracted=false;
  const fence=svg.match(/^\s*```(?:svg|xml)?\s*([\s\S]*?)\s*```\s*$/i);
  if(fence){svg=fence[1];extracted=true;}
  const picture=s.status==='success'&&previewableCheckupSVG(svg)?checkupSVG(svg):`<p class="checkup-warning">${s.status==='timeout'?'180 秒内未完整交付。':'本次没有完整、可安全预览的 SVG。'}${s.output?'已保留部分正文，见下方原文。':''}</p>`;
  return `<h3>画图补测 · low / 32768</h3><p class="evidence-meta">${e(s.note)}</p>${extracted?'<p class="checkup-warning">原回答添加了题目禁止的代码围栏。这里只为显示移除外层围栏，图形未修改；格式问题仍保留。</p>':''}${picture}<details><summary>查看补测原始回答</summary>${pre(s.output)}</details>`;
}
function answerCard(task,m,i,book=null){const row=m.report.runs[i];return `<article class="panel"><div class="panel-head"><h2><a class="model-nameplate" href="#checkup/model/${e(m.id)}">${modelBadge(m.id)}<span>${e(m.name)}</span></a>${m.selectedEffort?' · '+e(m.collectionLabel||m.selectedEffort):''}</h2>${verdict(m,i,book)}</div><div class="panel-body">${book?.highOnly?effortBadge(answerEffort(book.models.find(x=>x.modelId===m.id)?.items[i])):''}<p class="evidence-meta">${e(book?.models.find(x=>x.modelId===m.id)?.items[i].weightedNote||book?.models.find(x=>x.modelId===m.id)?.items[i].reason||m.checks[i].note)}</p>${i===5?`<h3>${e(book?.models.find(x=>x.modelId===m.id)?.items[i].measurement?.followup?'Grok 订阅 High':m.collectionLabel||(m.selectedEffort?'High 档':'首轮默认档 · 8192'))}</h3><p class="checkup-warning">${e(m.checks?.[i]?.note||row.note||'')}</p>${!m.selectedEffort&&row.outputs[0]?pre(row.outputs[0]):''}${supplementalPicture(m)}`:original(task,row)}${condition(m)}</div></article>`;}
const criteria=task=>`<details class="panel pub-criteria"><summary>这项怎么看？展开参考标准</summary><div class="panel-body"><p>${e(task.expected)}</p><ul>${task.checks.map(c=>`<li>${e(c.label)}</li>`).join('')}</ul></div></details>`;
export function publishedHome(data,bank,book=null,preferences={}){
  if(book?.highOnly)return studioHome(data,book,preferences);
  const displayedTasks=bank.tasks.map((t,i)=>book?.schemaVersion?.startsWith('daily-weighted-')?{...t,title:book.tasks[i].title,category:book.tasks[i].name+' · '+book.tasks[i].weight+'分'}:t);
  const hero=`<section class="editorial-hero"><div class="hero-copy"><p class="hero-kicker"><span class="hero-status-dot" aria-hidden="true"></span> MODELTEST / 逐风的 AI 试验场</p><h1>跑分很厉害，<br><span>这题你会吗？</span></h1><p>给国产 AI 出点日常题，也出点难绷的题。<br>谁答得漂亮，谁当场翻车，看原回答。</p><div class="hero-links"><a class="editorial-primary" href="#checkup/compare">选两个，比一比 <span aria-hidden="true">↗</span></a><a class="editorial-text-link" href="#checkup/how">看看怎么测 <span aria-hidden="true">→</span></a></div><div class="hero-facts"><span><b>${data.models.length}</b>个模型</span><span><b>8</b>道挑战</span><span><b>100</b>分制</span></div></div><a class="hero-challenge" href="#checkup/receipt"><div class="challenge-top"><span>本期整活</span><span>07 / 08</span></div><div class="challenge-photo"><img src="assets/receipt-chilli-pork.png" width="1320" height="1149" alt="测试用餐厅账单，点击查看完整原图"><span class="challenge-sticker" aria-hidden="true">1 份？<br>2 份？</span></div><div class="challenge-caption"><div><span>账单整活题 · 20分</span><h2>辣椒炒肉，到底几份？</h2></div><span class="challenge-open" aria-hidden="true">↗</span></div></a></section>`;
  return hero+(book?.highOnly?'':book?.matrix?`<section class="effort-intro"><strong>三档各跑一套，取总分最高档。</strong><p>low、medium、high用相同题目、输出上限和超时设置；不拼每题最高分，同分优先low。${book.models.some(r=>r.selectionFinal===false)?'三档尚未全部评完，当前分数暂定。':'本批三档已完成初评。'}</p><a href="#checkup/efforts">查看三档分数与全部答卷 ↗</a> · <a href="#checkup/history">查看旧默认档记录</a></section>`:'')+(book?(book.schemaVersion.startsWith('daily-weighted-')?weightedScoreboard(data,book,preferences):suiteScoreboard(data,book,preferences)):`<div class="pub-model-grid">${data.models.map(m=>`<a class="model-nameplate" href="#checkup/model/${e(m.id)}">${modelBadge(m.id)}<span>${e(m.name)}</span></a>`).join('')}</div>`)+
  (book?.highOnly?'':book?.matrix?`<section class="editorial-findings"><div class="section-heading"><div><span class="section-index">02 / THREE EFFORTS</span><h2>分数来自哪一档，也要看清楚。</h2></div><a href="#checkup/efforts">三档全部答卷 ↗</a></div><p>每个模型独立比较low、medium、high的完整八项总分。改字逐字核对，画图实际打开看；同档多轮历史不交叉。一次择优成绩不代表稳定性。</p></section>`:`<section class="editorial-findings"><div class="section-heading"><div><span class="section-index">02 / FIELD NOTES</span><h2>分数之外，看看现场。</h2></div><span class="section-aside">两处值得点开的细节</span></div><div class="finding-spread"><a class="finding-quote" href="#checkup/purpose"><span class="finding-label">01 / GLM-5.3 FLASH</span><blockquote>“走过去就行。”<br><span>然后，又让你开车去。</span></blockquote><p>同一次回答里出现两个方向。原文比一个分数更能说明问题。</p><span class="finding-bottom">GLM 洗车回答前后矛盾 <b>↗</b></span></a><a class="finding-visual" href="#checkup/visual"><span class="finding-label">02 / THE PELICAN TEST</span><div class="finding-number">0<span>/ 5<br>默认档完整出图</span></div><p>默认档画图均未完整交付。提高上限、切换 low 档后，四个模型出图。</p><span class="finding-bottom">看补测图片与失败原文 <b>↗</b></span></a></div></section>`)+
  `<section class="editorial-questions"><div class="section-heading"><div><span class="section-index">02 / THE QUESTIONS</span><h2>挑战题库</h2></div><a class="editorial-text-link" href="#checkup/how">完整题目与评分 ↗</a></div><div class="checkup-grid">${displayedTasks.map((t,i)=>`<article class="checkup-card"><a class="question-card-link" href="#checkup/${e(t.id)}"><span class="question-number">0${i+1}</span><div><span class="question-category">${e(t.category)}</span><h3>${e(t.title)}</h3></div><span class="question-arrow" aria-hidden="true">→</span></a></article>`).join('')}${receiptTeaser(book?.highOnly?book.highSource.models.filter(m=>m.items[6].measurement?.attempts.length).length:book?.tasks?.length===8)}${book?.tasks?.length===8?`<article class="checkup-card"><a class="question-card-link" href="#checkup/zebra"><span class="question-number">08</span><div><span class="question-category">斑马绘画 · 15分</span><h3>画一只在非洲草原奔跑的斑马</h3></div><span class="question-arrow" aria-hidden="true">→</span></a></article>`:''}</div></section>`+
  `<section class="editorial-about"><div><span class="section-index">A NOTE FROM 逐风</span><h2>认真测评，<br>也认真整活。</h2></div><div><p>这是逐风03发起的国产 AI 模型实测项目。希望把宣传里的能力指标讲清楚，再用具体任务展示模型实际怎么回答。也会出点整活题，看看模型会不会翻车，图个好玩。这批日常小测试不代表模型的全部能力。</p><div class="author-links"><a class="editorial-text-link" href="#checkup/contact">关于与联系 ↗</a></div></div></section><details class="publication-evidence"><summary>本批测试设置、数据来源与评审说明 <span>＋</span></summary>${source(data)}<p>${book?.highOnly?'本轮只发送high，无客户端总时长；最大输出按可核实公开配置，未知或预算不足留未测。':book?.matrix?'本轮显式low、medium、high，共同上限16384、300秒、无重试；旧默认档另存历史。':'同一入口默认推理，输出上限8192、180秒超时。画图low/32768补测单列。'}八项权重合计100分，未测保留空值；除逐字改写外默认由助手初评，站长已确认的单项单独标注。</p><a href="#checkup/how">完整测试方法 ↗</a></details>`;
}

function promptBlock(task){if(task.prompts.length===1)return pre(task.prompts[0],false);const intro=task.id==='edit'?'先保存集合通知，再只把周六下午三点改为周日下午四点，其他文字不动。':'先记住两人、合计预算1500元、不开车、周日晚回；中间聊三轮，再列出原先的限制。';return `<p>${e(intro)}</p><details><summary>查看完整 ${task.prompts.length} 轮提问</summary>${task.prompts.map((p,i)=>`<h4>第 ${i+1} 轮提问</h4>${pre(p,false)}`).join('')}</details>`;}
export function publishedTask(data,bank,id,book=null){const i=bank.tasks.findIndex(t=>t.id===id);if(i<0)return missing();const t=bank.tasks[i];return header(book?.schemaVersion?.startsWith('daily-weighted-')?book.tasks[i].title:t.title,book?.schemaVersion?.startsWith('daily-weighted-')?book.tasks[i].name+' · 满分'+book.tasks[i].weight+'分；同题实际答卷与判分理由。':'同一道题，查看五个模型实际怎么答。','<a class="button-link" href="#checkup/results">← 八题实测榜</a>')+(['reasoning','edit','memory'].includes(id)?'<p><a class="column-link" href="#checkup/harness">同类能力的工程实测 →</a></p>':'')+sourceDetails(data)+`<section class="panel"><div class="panel-body"><h2>测试题目</h2>${promptBlock(t)}</div></section>`+data.models.map(m=>answerCard(t,m,i,book)).join('')+(book?.schemaVersion?.startsWith('daily-weighted-')?`<details class="panel pub-criteria"><summary>这项怎么看？展开参考标准</summary><div class="panel-body"><h3>${e(book.tasks[i].name)} · ${book.tasks[i].weight}分</h3><p>满分：${e(book.tasks[i].full)}<br>部分：${e(book.tasks[i].partial)}<br>0分：${e(book.tasks[i].zero)}</p></div></details>`:criteria(t));}
export function publishedModel(data,bank,id,book=null,preferences={}){const m=data.models.find(x=>x.id===id);if(!m)return missing();const weighted=book?.schemaVersion?.startsWith('daily-weighted-'),weightedRow=weighted?book.models.find(x=>x.modelId===id):null;if(book?.highOnly&&weightedRow)return studioModelPage(data,bank,book,id,preferences,sourceDetails(data)+`<details class="publication-evidence"><summary>测试设置与请求记录</summary>${highPanel(book,id)}${condition(m)}</details>`);return header(m.name,weighted?(book.tasks.length===8?'八项百分制、实际答卷与扣分理由。':'七项百分制、实际答卷与扣分理由。'):'六项原文、采集条件和初步判断。','<a class="button-link" href="#checkup">← 最新实测</a><a class="button-link" href="#checkup/compare">与其他模型对比 →</a>',m.id)+sourceDetails(data)+(weighted?weightedModelSummary(book,weightedRow,m,preferences):'')+`<details class="publication-evidence"><summary>测试设置与请求记录</summary>${highPanel(book,id)}${effortPanel(book,id)}${condition(m)}</details>`+bank.tasks.map((t,i)=>`<section class="panel"><div class="panel-head"><h2><a href="#checkup/${e(t.id)}">${i+1}. ${e(t.title)}</a></h2>${verdict(m,i,book)}</div><div class="panel-body">${i!==5?`<h3>发给模型的题目</h3>${promptBlock(t)}<h3>实际回答</h3>`:''}${i===5?`<p class="checkup-warning">${m.selectedEffort?e(m.selectedEffort)+'档：':'首轮默认档：'}${e(book?.models.find(x=>x.modelId===m.id)?.items[i].weightedNote||book?.models.find(x=>x.modelId===m.id)?.items[i].reason||m.checks[i].note)}</p>${supplementalPicture(m)}`:original(t,m.report.runs[i])}<p class="evidence-meta">${e(book?.models.find(x=>x.modelId===m.id)?.items[i].weightedNote||book?.models.find(x=>x.modelId===m.id)?.items[i].reason||m.checks[i].note)}</p></div></section>`).join('')+(weighted&&book.tasks.length===8?completionCard(book,weightedRow,m,'receipt')+completionCard(book,weightedRow,m,'zebra'):weighted?`<section class="panel"><div class="panel-head"><h2>7. 账单图片识别 · 20分</h2><span>待测 / 20</span></div><div class="panel-body"><p>尚未向本模型发送原图，不填0分或满分。已纳入总分体系，完成后才能给最终评级。</p><a class="button-link" href="#checkup/receipt">查看原图、提问和评分 →</a></div></section>`:'');}
const missing=()=>header('没有找到这份答卷','请选择本批已发布模型。','<a href="#checkup">回到最新实测</a>');

function historyPage(data,bank,book,section,modelId,ratings){
  const historyRoute='#checkup/history';
  if(section==='model'&&data.models.some(model=>model.id===modelId)){
    const archiveNav=`<p class="checkup-warning"><a href="${historyRoute}">← 历史默认档</a> · 默认档与当时的补测记录</p>`;
    return archiveNav+publishedModel(data,bank,modelId,book,{rating:ratings[modelId]||0});
  }
  if(section)return header('没有找到这份历史答卷','','<a href="#checkup/history">返回历史默认档</a>');
  return `<div class="column-page studio-home"><header class="column-heading">
    <a class="column-link" href="#checkup/results">← 八题实测榜</a><h1>历史默认档</h1>
    <p>查看首批模型的默认档答卷与当时的补测记录。</p></header>
    <section class="column-section"><div class="column-section-head"><h2>历史答卷</h2></div><ul class="archive-models">${data.models.map(model=>{
      const row=book.models.find(item=>item.modelId===model.id);
      const score=weightedSummary(book,row);
      return `<li><a class="column-link" href="${historyRoute}/model/${e(model.id)}">${e(model.name)}</a><span>${score.graded?formatPoints(score.earned)+' / 100':'待测'}</span></li>`;
    }).join('')}</ul></section></div>`;
}
function comparison(data,bank,a,b,book=null){
 const latest=!a&&!b?['gpt62-sol','gpt62-astra'].map(id=>data.models.find(model=>model.id===id)):[];
 const one=data.models.find(model=>model.id===a)||latest[0]||data.models[0];
 const two=data.models.find(model=>model.id===b&&model.id!==one.id)||latest[1]||data.models.find(model=>model.id!==one.id);if(book?.highOnly)return studioComparePage(data,bank,book,one,two,sourceDetails(data)+`<details class="publication-evidence"><summary>双方测试设置与请求记录</summary>${[one,two].map(m=>`<h3>${e(m.name)}</h3>${highPanel(book,m.id)}${condition(m)}`).join('')}</details>`);return header('两个模型，同题对照','逐项对照回答、得分和绘图。')+sourceDetails(data)+`<div class="pub-selectors">${[one,two].map((m,i)=>modelPicker(data.models,m.id,i)).join('')}</div>`+(book?.schemaVersion?.startsWith('daily-weighted-')?`<div class="weighted-compare-totals">${[one,two].map(m=>{const summary=weightedSummary(book,book.models.find(r=>r.modelId===m.id));return `<div><span class="model-nameplate">${modelBadge(m.id)}<span>${e(m.name)}</span></span>${m.selectedEffort?' · '+e(m.selectedEffort):''}<strong>${summary.graded?formatPoints(summary.earned):'—'} / 100${summary.complete?'':' 暂得'}</strong><small>${summary.complete?e(summary.grade):'已评 '+summary.evaluated+' 分权重 · 待测 '+summary.remaining+' 分'}</small></div>`;}).join('')}</div>`:'')+bank.tasks.map((t,i)=>`<section class="panel"><div class="panel-head"><h2><a href="#checkup/${e(t.id)}">${e(t.title)}</a></h2></div><div class="panel-body"><details><summary>查看本项提问</summary>${promptBlock(t)}</details><div class="checkup-pair">${[one,two].map(m=>`<div><h3 class="model-heading">${modelBadge(m.id)}<span>${e(m.name)}</span> ${verdict(m,i,book)}</h3>${i===5?`<p>${m.selectedEffort?e(m.selectedEffort)+'档：':'首轮：'}${e(book?.models.find(x=>x.modelId===m.id)?.items[i].weightedNote||book?.models.find(x=>x.modelId===m.id)?.items[i].reason||m.checks[i].note)}</p>${supplementalPicture(m)}`:original(t,m.report.runs[i])}</div>`).join('')}</div></div></section>`).join('')+(book?.tasks?.length===8?completionComparison(book,data,[one,two],'receipt')+completionComparison(book,data,[one,two],'zebra'):book?.schemaVersion?.startsWith('daily-weighted-')?`<section class="panel"><div class="panel-head"><h2>账单图片识别 · 20分</h2></div><div class="panel-body"><div class="checkup-pair">${[one,two].map(m=>`<div><h3 class="model-heading">${modelBadge(m.id)}<span>${e(m.name)}</span></h3><p>待测 / 20分。没有原图测试答卷。</p></div>`).join('')}</div><a href="#checkup/receipt">查看原图与评分标准 ↗</a></div></section>`:'');}
function method(data){if(data.highOnly)return header('题目与评分','八题实测榜的第 2、3 题已换成圣诞树配乐与并发缓存。短题另计。')+`<section class="panel"><div class="panel-body checkup-how"><ol class="method-steps"><li><strong>八题实测榜。</strong>八题合计 100 分。前端和后端各取 Agent 原分 ÷ 10。八题都出分才排名和评星。80 分合格、90 分优秀。</li><li><strong>分数来自实际答卷。</strong>前端看音乐同步、画面和实际播放，后端用程序校验并发、过期与缓存状态。账单按本站约定评分。部分交付异常经复核后仍可评分，详情页注明判分依据。</li><li><strong>每批保留自己的测试设置。</strong>思考强度按发送时的设置标注。两道工程题使用各模型对应的 Agent harness。待测或待复核的分数留空。</li></ol><p><a href="#checkup/agent-challenge">圣诞树与并发缓存 →</a> · <a href="#checkup/harness">三道工程实测 →</a> · <a href="#checkup/season">短题与开发题 →</a></p></div></section>`+sourceDetails(data)+`<details class="publication-evidence"><summary>原始答卷与历史题目</summary><p><a href="data/christmas-cache-v1.json" download>圣诞树及并发缓存评分</a> · <a href="data/high-suite.json" download>基础批次</a> · <a href="data/high-expanded.json" download>扩展批次</a> · <a href="#checkup/history">历史记录</a></p><p><a href="#checkup/reasoning">旧题：推理纠错</a> · <a href="#checkup/edit">旧题：定点改字</a>。</p></details>`;if(data.effortMatrix)return header('三档怎么测，最高分怎么算','同一模型三档各跑完整八项，不组合每题最高分。')+sourceDetails(data)+`<section class="panel"><div class="panel-body checkup-how"><ol><li>五个型号分别显式发送low、medium、high。每档完整八项，改字两轮、记忆五轮，最多13次请求；整批最多195次。</li><li>所有档统一输出上限16384、300秒超时，无重试。每项独立会话，多轮题只使用本档前面的真实回答；账单附原PNG。</li><li>同一评分标准和权重，得到每档独立总分。三档评完后取完整总分最高档；同分依次优先low、medium、high。未测和待复核保留空值，不用旧默认档填补。</li><li>接口接受参数不等于独立证实上游采用该强度。报错和超时保留，本条件下交付失败计0，不声称是内容错误；不支持未经证实就不写“不支持”。</li><li>改字逐字比对，其余助手按原答卷初评，图形实际渲染查看；未冒充站长人工确认。SVG构图不等同于原生图片生成。</li></ol><p>本轮已发送${data.totalRequests}次，${data.successfulRequests}次成功。三档取最高属于择优展示，不能解释成平均或长期稳定性。新输出上限和超时与历史不同，不直接比较成降智或提升。</p><a href="data/effort-matrix.json" download>下载三档公开答卷与判分</a> · <a href="#checkup/history">旧默认档历史</a></div></section>`;return header('这些结果怎么来的','先了解测试条件，再判断一次回答的意义。')+sourceDetails(data)+`<section class="panel"><div class="panel-body checkup-how"><ol><li>本机向 CommandCode 的五个声明型号发送六项测试。每项新开会话；改句子两轮、记忆五轮，共 55 次首轮请求。</li><li>首轮采用服务商默认推理，输出上限 8192，180 秒超时，无重试。五个画图请求都未完整交付，保留失败原文与原因。</li><li>画图单独补测，每模型一次，显式 low 档、输出上限 32768、180 秒超时，共 5 次。补测图不算作默认档成绩。</li><li>2026年10月26日补测：五个模型各发送一次账单原图和斑马题，共10次请求。账单使用默认推理、8192输出上限；斑马使用low档、16384输出上限，均180秒超时、无重试。斑马评SVG构图，不代表原生图片生成。</li><li>改字题逐字比对；其他内容是助手初审，尚未由站长逐项人工确认。超时和输出耗尽表示未交付，不直接判模型内容错误。</li></ol><p>这批共 ${data.totalRequests} 次请求，${data.successfulRequests} 次完整返回。型号身份按服务商声明标注。公开小题只是日常筛查，不代表整体能力或长期降智。</p><p>同一入口、设置和题目在不同日期的重复采集尚未建立。本页不把不同条件自动解释成退步。</p><a href="data/daily-measured.json" download>下载原六项答卷 JSON</a> · <a href="data/completed-suite.json" download>下载八项成绩与新增原答卷 JSON</a> · <a href="#selftest">旧版六项录入工具（历史）</a></div></section>`;}
function contact(){return header('关于这个项目与作者','国产 AI 模型实测 · 逐风03 发起')+`<section class="panel"><div class="panel-body"><h2>让 AI 能力更容易理解</h2><p>这个项目希望把模型宣传里的 benchmark 和能力指标讲清楚，并通过普通人能判断的任务展示实际表现。网站有八题实测榜、作品和 Agent 专题。日常榜展示原答卷与判分依据，Agent 专题每题各自计分。</p></div></section><section class="panel"><div class="panel-body"><h2>联系逐风</h2><p>可以告诉我：你拿 AI 做什么、想比较哪几个模型或入口、遇到过什么具体问题。先确定可判断的任务，再约定样本和费用。</p><p>可以从一个具体问题开始，例如：同一份会议记录，两个入口谁整理得更可靠？</p><a class="button-link primary" href="https://x.com/03AIer" target="_blank" rel="noopener noreferrer">到 X 查看逐风 / @03AIer ↗</a><p class="evidence-meta">能否发送私信取决于 X 账号设置。</p></div></section>`;}
export function createPublishedDailyController({main,rerender}){
  const codexComparison = createCodexComparison(() => {
    if (location.hash === '#checkup/codex-gpt62') rerender();
  });
  const christmasChallenge=createChristmasChallenge(()=>{
    const page=location.hash.split('/')[1];
    if(page==='agent-challenge')rerender();
  });
  const harnessEval=createHarnessEval(()=>{if(location.hash==='#checkup/harness')rerender();});
  bindAnswerNavigation(main);
  main.addEventListener('click',event=>{const jump=event.target.closest('[data-repair-jump]');if(!jump)return;const target=main.querySelector('#'+jump.dataset.repairJump);if(target){target.scrollIntoView({block:'start',behavior:'instant'});target.focus({preventScroll:true});}});
  let shorts=null,shortResults=null,shortError='',shortLoading,seasonLoading,batchLoading,data=null,bank=null,book=null,previousBook=null,season=null,matrix=null,historyData=null,historyBook=null,error='',loading=false,ratings={},filter='all',saved=true;
  bindSeason(main,()=>season);
  bindShortChallenges(main,()=>shorts,()=>shortResults);
  const ratingKey='zhufeng-daily-six-personal-stars-v1';const audience=createAudienceController({main,rerender});const receipt=createReceiptController({main,rerender});
  const active=()=>!location.hash||location.hash.startsWith('#checkup');
  bindModelPickers(main,{getModels:()=>data?.models||[],onPick:(values,side)=>{location.hash='checkup/compare/'+values.join('/');globalThis.requestAnimationFrame?.(()=>main.querySelector('[data-model-picker="'+side+'"] > summary')?.focus({preventScroll:true}));}});
  function loadBatches() {
    return batchLoading ??= loadComparisonBatches();
  }
  async function loadShorts() {
    if (shortLoading) return;
    shortLoading = true;
    try {
      const [bankText,resultsText,batches] = await Promise.all([
        fetchText('short-challenges.json'), fetchText('short-challenge-results.json'), loadBatches(),
      ]);
      const results = JSON.parse(resultsText);
      if (globalThis.crypto?.subtle) {
        const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bankText));
        const hash = Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
        if (hash !== results.bankSha256) throw Error('题面与采集版本不一致');
      }
      shorts = validateShortBank(JSON.parse(bankText));
      shortResults = validateShortResults(results,shorts);
      for (const batch of batches) {
        try { shortResults = publishCodexShort(shortResults,batch,shorts); }
        catch { shortError = 'Codex 短题与当前版本不一致'; }
      }
    } catch {
      shortError = '短题实测文件暂时未读取或未通过核验';
    }
    if (['','#checkup','#checkup/'].includes(location.hash) ? book?.agentTasks :
        location.hash.split('/')[1] === 'season') rerender();
  }
  async function loadSeason() {
    if (seasonLoading) return;
    seasonLoading = true;
    try { season = validatePlayfulSeason(parseCheckupJSON(await fetchText('playful-season.json'))); }
    catch { season = false; }
    if (location.hash.split('/')[1] === 'season') rerender();
  }
  async function fetchText(file) {
    const response = await fetch('data/'+file);
    if (!response.ok) throw Error('实测文件没有读到');
    return response.text();
  }
  async function load() {
    if (loading) return;
    loading = true;
    const files = [
      'daily-measured.json','checkup.json','daily-scores.json','completed-suite.json',
      'high-suite.json','high-model-limits.json','high-expanded.json',
    ];
    try {
      const [published,agent,batches] = await Promise.all([
        Promise.all(files.map(async file=>parseCheckupJSON(await fetchText(file)))),
        christmasChallenge.evidence(),
        loadBatches(),
      ]);
      const [daily,questions,scores,completed,highRuns,limits,expanded] = published;
      bank = validateCheckupBank(questions);
      data = validatePublishedDaily(daily,bank);
      const legacy = validateDailyScores(scores,data,bank);
      book = validateCompletedSuite(completed,data,legacy,bank);
      data = {...data,totalRequests:data.totalRequests+book.newRequests,
        successfulRequests:data.successfulRequests+book.newSuccesses,publishedAt:book.updatedAt};
      historyData = data;
      historyBook = book;
      matrix = null;
      const high = validateHighSuite(highRuns,book,bank,limits);
      ({data,book} = projectHighSuite(high,data,book,bank));
      ({data,book} = mergeHighExpanded({data,book},expanded,bank));
      for (const batch of batches) {
        try { ({data,book} = publishCodexMain({data,book},batch,bank)); }
        catch { /* Keep existing results if a supplemental batch does not match. */ }
      }
      previousBook = book;
      book = projectAgentTasks(previousBook,agent);
      try { ratings = readRatings(localStorage,ratingKey,data); }
      catch { saved = false; }
    } catch (err) {
      error = err.message;
    }
    if (active() && !['season','codex-gpt62','harness','agent-challenge','privacy'].includes(location.hash.split('/')[1])) rerender();
  }
  function renderSeason(id) {
    if (['boss-sokoban','gear-scam'].includes(id)) {
      loadShorts();
      if (shorts && shortResults) return shortTaskPage(shorts,shortResults,id);
      if (shortError) return header('短题实测暂时未读取',shortError,'<a href="#checkup/results">查看八题实测榜 →</a>');
      return '<p role="status">正在读取短题实测…</p>';
    }
    loadSeason();
    if (season === null) return '<p role="status">正在读取题目…</p>';
    if (!season) return header('新一期题面暂时未读取','请稍后刷新。','<a href="#checkup/results">查看八题实测榜 →</a>');
    if (id) return seasonPage(season,id);
    loadShorts();
    return seasonPage(season,'',shorts&&shortResults?shortOverview(shorts,shortResults):'');
  }
  function render(parts=[]){if(parts[0]==='codex-gpt62')return codexComparison();if(parts[0]==='harness')return harnessEval();if(parts[0]==='agent-challenge')return christmasChallenge.render(parts[1],parts[2]);if(parts[0]==='privacy')return siteNotesPage();const [page,id,other]=parts;if(page==='season')return renderSeason(id);if((!data||!book?.agentTasks)&&!error){load();if(!page)loadShorts();return '<p role="status">正在读取已发布的真实答卷…</p>';}if(error)return header('实测答卷暂时没有读出来',error,'<a href="#selftest">使用手动自测工具</a>');if(page==='play'||page==='works')return studioWorks(data,book,page==='play'?'':id,other);if(page==='repairs')return studioRepairs(data,previousBook,bank,{historicalEdit:true});if(page==='reasoning'||page==='edit')return '<p class="checkup-warning">旧版题目 · 历史答卷</p>'+publishedTask(data,bank,page,previousBook);if(page==='model'&&book.highOnly&&other&&other!=='high')return header('本轮只测HIGH','其他档位已停止，不参与本轮成绩。','<a href="#checkup/model/'+e(id)+'">查看本轮HIGH答卷 →</a>');if(page==='history')return historyPage(historyData,bank,historyBook,id,other,ratings);if(page==='efforts'&&book.highOnly)return publishedHome(data,bank,book,{ratings,filter,saved});if(page==='efforts')return effortOverview(book);if(page==='model'&&matrix&&EFFORTS.includes(other)){const shown=projectEffortMatrix(matrix,historyData,historyBook,bank,{[id]:other});return publishedModel(shown.data,bank,id,shown.book,{rating:ratings[id]||0});}if(page==='zebra')return zebraPage(book,data);if(page==='audience')return audience.render();if(page==='receipt')return receipt.render(data.models,book);if(page==='results')return studioArchive(data,book,{ratings,filter,saved});if(!page){loadShorts();return publishedHome(data,bank,book,{ratings,filter,saved,shortHighlights:shortHighlights(shorts,shortResults),agentRun:christmasChallenge.forModel('grok47')});}if(page==='model'&&book.schemaVersion.startsWith('daily-weighted-'))return publishedModel(data,bank,id,book,{rating:ratings[id]||0});if(page==='model'){const m=data.models.find(x=>x.id===id),row=book.models.find(x=>x.modelId===id);if(!m||!row)return missing();const s=suiteSummary(row);return publishedModel(data,bank,id,book).replace(condition(m),`<section class="panel"><div class="panel-body"><h2>六项测试集 · ${s.complete?s.total+' / 12 分':'待评完'}</h2><p>${s.passed} / 6 项通过 · ${s.fullPass?'整套通过':'未全部通过'} · 助手初评</p>${personalStars(m,ratings[id]||0)}<p class="evidence-meta">${saved?'星评仅保存在当前浏览器，不改变测试成绩。':'浏览器未允许保存；星评仅在当前页面有效。'}</p>${suiteScoreDetails(row)}</div></section>`+condition(m));}if(page==='compare')return comparison(data,bank,id,other,book);if(page==='how')return method(data)+(book.schemaVersion.startsWith('daily-weighted-')?weightedRubric(book):suiteRubric());if(page==='contact')return contact();return publishedTask(data,bank,page,book);}
  main.addEventListener('click',ev=>{const button=ev.target.closest('[data-suite-star]');if(!button||!active()||!data)return;const id=button.dataset.suiteStar,n=Number(button.dataset.rating);if(!data.models.some(m=>m.id===id)||!Number.isInteger(n)||n<1||n>5)return;if(ratings[id]===n)delete ratings[id];else ratings[id]=n;try{saved=saveRatings(localStorage,ratingKey,data,ratings);}catch{saved=false;}rerender();const star=main.querySelector(`[data-suite-star="${id}"][data-rating="${n}"]`),disclosure=star?.closest('.reader-rating');if(disclosure)disclosure.open=true;star?.focus({preventScroll:true});});
  main.addEventListener('change',ev=>{if(active()&&ev.target.hasAttribute('data-suite-filter')){filter=ev.target.value;rerender();main.querySelector('[data-suite-filter]')?.focus({preventScroll:true});}});
  main.addEventListener('change',ev=>{if(!active()||!data||!ev.target.hasAttribute('data-pub-compare'))return;const selects=[...main.querySelectorAll('[data-pub-compare]')];const values=selects.map(s=>s.value);if(values[0]===values[1])values[1-Number(ev.target.dataset.pubCompare)]=data.models.find(m=>m.id!==ev.target.value).id;location.hash='checkup/compare/'+values.join('/');});
  return {render};
}
