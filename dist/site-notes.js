import {analyticsConsent,analyticsDisabled,setAnalyticsConsent} from './traffic.js?v=20261031-player6';

export function bindSiteNotes({root=document,events=window,storage=()=>localStorage,nav=navigator,hostname=location.hostname}={}){
  function refresh(){
    const status=root.querySelector('#analytics-choice-status');
    if(!status)return;
    try{
      const store=storage(),choice=analyticsConsent(store);
      status.textContent=choice===null?'尚未选择：不启用本站访问分析。':choice===false?'已关闭本站访问分析。':analyticsDisabled(store,nav,hostname)?'已允许，但浏览器隐私偏好或本机排除设置优先，当前不统计。':'已允许本站访问分析，可随时在此关闭。';
      root.querySelectorAll('[data-analytics-choice]').forEach(button=>button.setAttribute('aria-pressed',String(choice!==null&&choice===(button.dataset.analyticsChoice==='allow'))));
    }catch{status.textContent='浏览器存储不可用，不启用本站访问分析。';}
  }
  root.addEventListener('click',ev=>{
    const button=ev.target.closest('[data-analytics-choice]');
    if(!button||!root.contains(button)||!['allow','deny'].includes(button.dataset.analyticsChoice))return;
    try{
      setAnalyticsConsent(storage(),button.dataset.analyticsChoice==='allow');
      events.dispatchEvent(new Event('analyticsconsentchange'));
      refresh();
    }catch{const status=root.querySelector('#analytics-choice-status');if(status)status.textContent='无法保存选择，请检查浏览器存储后重试。';}
  });
  events.addEventListener('storage',refresh);
  return {refresh};
}

export function siteNotesPage(){return `<div class="page-head"><div><div class="eyebrow">MODELTEST / 站点说明</div><h1>隐私与声明</h1><p class="subtitle">测评范围、内容权利，以及由你决定的访问统计。</p></div><a class="button-link" href="#checkup">返回首页</a></div>
<article class="policy-content">
<p class="policy-intro">本站为逐风03发起的个人测评项目。分数仅对应所列题目、入口和测试条件，不代表模型全部能力；模型回答及绘图为 AI 生成，可能有误。</p>
<section><h2>测评范围</h2><p>官方 benchmark 引用与本站日常实测分开说明；评分来源以页面标注为准，助手初评不等同于人工确认。原始答卷、日期与设置见<a href="#checkup/how">题目评分</a>。</p></section>
<section><h2>内容与权利</h2><p>引用资料、题目及图片应按各自授权或适用的引用规则使用，标注来源不代表取得完整转载许可。第三方商标归其权利人所有，展示不表示官方合作或背书。若认为内容有误、涉及隐私或侵权，请联系逐风03并提供页面地址与具体问题。</p></section>
<section><h2>AI 内容与合作</h2><p>页面中的模型回答、代码及模型绘图为 AI 生成，仅作为测评样本展示。广告、赞助或返佣关系如有，应在相关内容旁单独标明；本说明不代替逐项披露。</p></section>
<section class="privacy-choice"><h2>可选访问分析</h2><p>未选择前不启用本站自建访问分析。允许后，为统计浏览量、去重浏览器及合作展示，会向本站接口发送随机浏览器标识、事件编号、页面类别、来源类别和设备类别。浏览器标识及选择最长有效30天；服务端保存标识哈希与访问时间等记录，按90天窗口保留，访问统计接口时清理过期明细；公开仅展示汇总，不公开个人标识。哈希不等同于完全匿名。</p>
<h3>托管与选择</h3><p>本站使用 Cloudflare 托管基础设施，统计请求及数据可能在中国大陆以外处理。以下允许按钮仅针对上述可选统计；不允许或关闭不影响浏览，关闭时清除本地统计标识并停止后续上报。网站正常交付所需的托管及安全日志由平台依其规则处理，未纳入此开关，也不承诺“零日志”。</p><div class="analytics-choice"><button type="button" data-analytics-choice="allow" aria-pressed="false">允许上述统计及境外处理</button><button type="button" data-analytics-choice="deny" aria-pressed="false">不允许 / 关闭统计</button><span id="analytics-choice-status" role="status" aria-live="polite">尚未选择：不启用本站访问分析。</span></div></section>
<section><h2>联系与权利请求</h2><p><a href="https://zhufeng-lab.pages.dev/" target="_blank" rel="noopener noreferrer">逐风个人主页</a> · <a href="https://x.com/03AIer" target="_blank" rel="noopener noreferrer">X / @03AIer</a>。可提出内容更正、授权或删除请求；既有统计记录的定位、删除需核实处理，目前不提供自助删除；请勿提交敏感材料。本站不以继续浏览视为同意。本说明不代表已完成备案、取得第三方授权或通过合规认证。更新：2026-10-27。</p></section>
</article>`;}
