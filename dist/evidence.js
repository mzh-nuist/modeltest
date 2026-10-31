export function taskSummary(data,modelId,taskId){
  const runs=data.runs.filter(r=>r.modelId===modelId&&r.taskId===taskId);
  const attempted=runs.filter(r=>r.status!=='skipped');
  const passed=runs.filter(r=>r.status==='success'&&r.grading.status==='passed').length;
  const failed=runs.filter(r=>r.status==='success'&&r.grading.status==='failed').length;
  return {runs,attempted:attempted.length,passed,failed,pending:runs.filter(r=>r.status==='success'&&r.grading.status==='pending').length,requestErrors:attempted.filter(r=>r.status!=='success').length,skipped:runs.length-attempted.length,latest:runs.at(-1)||null};
}

export function graderDescription(type){
  return {contract:'版本化契约：内容分、逐项约束与合格判定分开。数值按声明容差，人工题需逐项锚点证据，未评保持pending。',
    exact:'去除首尾空白后逐字匹配。额外解释、Markdown 或不同格式均会不通过，即使其中包含正确数值。',
    json_fields:'整段回答必须能直接解析为 JSON 对象，比较预设字段、值和类型，允许额外字段。代码围栏、额外说明、重复键和非有限数值不符合本规则。',
    contains:'检查预设必需片段；不能据此证明全文正确。',
    manual:'依据公开标准人工复核；在评审完成前保持待评。'}[type]||'未知评分方式';
}

export function comparisonWarnings(data,models){
  const sets=models.map(m=>new Set(data.runs.filter(r=>r.modelId===m.id&&r.status==='success'&&['passed','failed'].includes(r.grading.status)).map(r=>r.taskId)));
  const warnings=[];
  if(sets.length>1&&sets.some(s=>s.size!==sets[0].size||[...s].some(id=>!sets[0].has(id))))warnings.push('所选配置的已评分题目覆盖不同；通过率不能直接当作同一考试的排名。');
  if(models.length&&sets.some(s=>s.size<20))warnings.push('独立已评题目较少，当前结果仅供检查具体案例，不支持总体能力或显著差异声明。');
  return warnings;
}

export function percentile(values,p){
  const sorted=values.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const position=(sorted.length-1)*p,low=Math.floor(position),high=Math.ceil(position);
  return sorted[low]+(sorted[high]-sorted[low])*(position-low);
}

export function speedSummary(data,modelId,taskId='all'){
  const runs=data.runs.filter(r=>r.modelId===modelId&&(taskId==='all'||r.taskId===taskId)&&r.status!=='skipped');
  const ok=runs.filter(r=>r.status==='success');
  const values=key=>ok.map(r=>r.metrics[key]).filter(x=>typeof x==='number'&&Number.isFinite(x));
  const tps=values('outputTps'),duration=values('durationMs');
  return {attempted:runs.length,success:ok.length,errors:runs.length-ok.length,timeouts:runs.filter(r=>r.status==='timeout').length,
    ttft:percentile(values('ttftMs'),.5),ttfa:percentile(values('ttfaMs'),.5),duration:percentile(duration,.5),p90:percentile(duration,.9),
    tps:percentile(tps,.5),tpsSamples:tps.length,cps:percentile(values('charsPerSec'),.5),durationSamples:duration.length};
}
