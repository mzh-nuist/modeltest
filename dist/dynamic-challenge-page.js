import {pelicanPlayer} from './pelican-player.js?v=20261031-player6';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dynamicChallengePage(task,bank,criteria){
 const o=task.observation;
 return `<div class="season-page dynamic-page"><div class="season-breadcrumb"><a href="#checkup">首页</a><span>/</span><a href="#checkup/season">新一期挑战</a></div>
 <article class="season-task dynamic-challenge" id="season-dynamic-pelican">
  <header class="dynamic-intro"><p class="season-eyebrow">动态挑战 <span class="dynamic-status">待实测</span></p><h1>鹈鹕骑车，<br class="dynamic-mobile-break">脚还踩得住吗？</h1><p>让 AI 画一段循环动画，看看脚、踏板和腿能不能一直配合。</p>
   <div class="dynamic-actions"><button type="button" class="dynamic-copy" data-season-copy="${e(task.id)}" data-prompt-index="0">复制挑战题</button><button type="button" data-pelican-score-jump>看判分要点</button></div>
  </header>
  ${pelicanPlayer()}
  <section class="dynamic-score-summary" data-score-summary tabindex="-1"><h2>看这四处，就懂它怎么翻车</h2><div class="dynamic-check-grid">
   <div><h3>脚跟得上吗？</h3><p>两脚贴着各自踏板，踏板围绕同一个中心错开半圈。</p></div>
   <div><h3>腿还连着吗？</h3><p>腿随踩踏弯伸，持续连接身体和脚。</p></div>
   <div><h3>骑姿稳不稳？</h3><p>身体坐在车座上，两翼一直扶住车把。</p></div>
   <div><h3>能一直骑吗？</h3><p>车轮向前转，每两秒完成一次踩踏，循环不跳变。</p></div>
  </div><button type="button" class="pelican-evidence-link" data-pelican-evidence>看错误示例：0.50 秒，脚踏分离 ↑</button><p class="season-muted">本例由出题方制作，仅说明一种错误，不代表任何模型表现。</p></section>
  <section class="dynamic-rules"><h2>题目与评分</h2><p class="dynamic-score-split">独立 100 分：内容 80 · 格式 10 · 交付 10</p>
   <details class="dynamic-prompt" data-dynamic-prompt><summary>查看完整挑战题</summary><div class="season-prompt"><pre>${e(task.prompts[0])}</pre></div></details>
   <details class="season-rubric"><summary>完整评分 · 内容80 / 格式10 / 交付10</summary><p class="season-muted">逐项记录证据。内容合格要求全部内容检查通过；总分不能替代合格判据。</p>${criteria}<h4>动态核验方式</h4><p>每 ${o.periodSeconds} 秒一个踩踏周期，观察 ${o.cycles} 个完整周期；每周期 ${o.samplesPerCycle} 帧，共 ${o.totalFrames} 个观察帧，另核对 ${o.boundarySeconds.join('、')} 秒循环边界。</p><p>${e(o.note)}</p><p>题目版本：${e(task.scoreVersion)} · 观察多个周期不代表多次调用模型。</p><h4>合格与复核条件</h4><ul>${task.gates.map(x=>`<li>${e(x)}</li>`).join('')}</ul></details>
   <details class="season-reference"><summary>出题方参考解 · 不是模型答卷</summary><p>${e(task.reference.explanation)}</p><pre>${e(task.reference.answer)}</pre></details>
  </section>
  <section class="dynamic-results"><h2>模型答卷</h2><p>模型结果：待实测。当前没有动态题成绩，示意动画不参与排名。</p><p>真实答卷的扣分依据需要附时间点和截图，方便逐项复核。</p><a class="season-link" href="#checkup/results">查看第一期旧成绩 →</a></section>
  <details class="dynamic-protocol"><summary>完整规则、版本与题库下载</summary><p>${e(bank.protocol.note)}</p><p>${e(bank.protocol.revision)}</p><p>原静态答卷与成绩保留；动态题另计分。模型调用 ${bank.modelCalls} 次。</p><p>${e(bank.suiteId)} · ${e(task.scoreVersion)}</p><a class="season-link" href="data/playful-season.json" download="zhufeng-playful-development-v2.json">下载题面与评分 JSON ↓</a><a class="season-link" href="#checkup/season">查看全部新题 →</a></details>
 </article><p role="status" aria-live="polite" class="season-copy-status" data-season-copy-status></p></div>`;
}
