import {esc as e,stats,fmt} from './lib.js?v=20261101-short1';
import {comparisonScope,measurementScope} from './scope.js?v=20261101-short1';
const money=x=>'$'+fmt(x,6);
const palette=['#5370a4','#8463a4','#b16a40','#31877e','#aa5276','#7a8136'];

export function qualityChart(data,category='all'){
  const common=comparisonScope(measurementScope(data,{category}),data.models.map(m=>m.id));
  const points=common.models.map(m=>({m,s:stats(common,m.id)})).filter(p=>p.s.ruleCost!==null&&p.s.ruleDelivery!==null);
  if(!points.length)return '<div class="empty"><div><strong>没有费用齐备的共同规则题</strong><p>仅在共同已尝试题上绘图，任一次相关费用未知就不补点。请查看分项证据。</p></div></div>';
  const max=Math.max(...points.map(p=>p.s.ruleCost),.000001)*1.15;
  return `<div class="panel-body"><svg class="chart" viewBox="0 0 520 245" role="img" aria-label="共同规则题：横轴为题目等权的每次尝试估算费用，纵轴为含失败的规则交付率。"><line x1="48" y1="20" x2="48" y2="205"/><line x1="48" y1="205" x2="492" y2="205"/>${[0,.25,.5,.75,1].map(v=>`<line x1="48" y1="${205-v*175}" x2="492" y2="${205-v*175}"/><text x="7" y="${209-v*175}">${v*100}%</text>`).join('')}${points.map(({m,s},i)=>`<a href="#model/${e(m.id)}" aria-label="${e(m.name)}：${fmt(s.ruleDelivery*100)}%，${money(s.ruleCost)}"><circle cx="${48+s.ruleCost/max*430}" cy="${205-s.ruleDelivery*175}" r="7" style="fill:${palette[i%palette.length]};opacity:.7"><title>${e(m.name)}：${fmt(s.ruleDelivery*100)}%，${money(s.ruleCost)}</title></circle></a>`).join('')}<text x="48" y="229">$0</text><text x="368" y="229">${money(max)} →</text></svg>
  <p class="evidence-meta">每道规则题先算通过交付次数 / 尝试次数，再在题目间等权平均；错误和超时计入分母，人工题不参与。费用也先按题平均，包含失败；它是每次尝试费用，并非得到合格答案的总成本。相同位置的点可能重叠，下方保留全部数值。</p>
  <div class="chart-legend">${points.map(({m,s},i)=>`<a href="#model/${e(m.id)}"><i style="background:${palette[i%palette.length]}"></i><span>${e(m.name)}<small>${fmt(s.ruleDelivery*100)}% · ${money(s.ruleCost)} / 尝试 · ${s.ruleTasks} 道规则题 · ${s.gradedTasks} 道已评题</small></span></a>`).join('')}</div></div>`;
}
