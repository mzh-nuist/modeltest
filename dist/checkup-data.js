import {parseChallengeJSON, staticSVGShape} from './challenge-data.js?v=20261031-player6';

export const CHECKUP_SUITE = 'zhufeng-daily-six-v1';
export const CHECKUP_IDS = ['purpose', 'reasoning', 'edit', 'memory', 'honesty', 'visual'];
export const VERDICTS = {normal:'正常', missed:'漏了要求', wrong:'明显答错', review:'需要人看', not_run:'未测'};
export const parseCheckupJSON = parseChallengeJSON;
const fail = message => { throw Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fields(value, names) {
  if (!object(value) || Object.keys(value).length !== names.length || names.some(k => !Object.hasOwn(value, k))) fail('文件字段不符合六项体检格式');
}
function text(value, maximum=100000, empty=true) {
  if (typeof value !== 'string' || [...value].length > maximum || (!empty && !value.trim())) fail('文字为空或过长');
}
function timestamp(value) {
  text(value, 50, false);
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || +m[1] < 1 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate() || +m[4] > 23 || +m[5] > 59 || +m[6] > 59 || !Number.isFinite(Date.parse(value))) fail('测试时间需要有效日期和时区');
}

export function validateCheckupBank(bank) {
  fields(bank, ['schemaVersion','suiteId','title','tasks']);
  if (bank.schemaVersion !== 'daily-checkup-bank-v1' || bank.suiteId !== CHECKUP_SUITE) fail('不是这版六项体检题库');
  text(bank.title, 200, false);
  if (!Array.isArray(bank.tasks) || bank.tasks.length !== 6 || bank.tasks.some((t,i) => !object(t) || t.id !== CHECKUP_IDS[i])) fail('题库必须包含固定的六项');
  for (const task of bank.tasks) {
    fields(task, ['id','title','category','optional','mode','prompts','expected','checks','exactAnswer']);
    for (const key of ['title','category','expected']) text(task[key], 3000, false);
    if (task.optional !== (task.id === 'visual') || task.mode !== (task.id === 'edit' ? 'exact' : 'guided')) fail('题型或可选状态错误');
    if (!Array.isArray(task.prompts) || task.prompts.length !== ({edit:2,memory:5}[task.id] || 1)) fail('会话轮数错误');
    task.prompts.forEach(p => text(p, 5000, false));
    if (!Array.isArray(task.checks)) fail('检查点错误');
    const seen = new Set();
    for (const check of task.checks) {
      fields(check, ['id','label','essential']); text(check.id,50,false); text(check.label,300,false);
      if (seen.has(check.id) || typeof check.essential !== 'boolean') fail('重复检查点');
      seen.add(check.id);
    }
    if (task.mode === 'exact') {
      text(task.exactAnswer,3000,false); if (task.checks.length) fail('逐字检查不使用人工打分');
    } else if (task.exactAnswer !== null || !task.checks.length) fail('人工题必须有检查点');
  }
  return bank;
}

export function newCheckupReport(bank, label='尚未填写模型名称') {
  return {schemaVersion:'daily-checkup-report-v1', suiteId:CHECKUP_SUITE, kind:'imported', modelLabel:label, checkedAt:null, conditions:'',
    runs:bank.tasks.map(t => ({taskId:t.id, status:'not_run', outputs:t.prompts.map(() => null), review:null, note:''}))};
}

export function validateCheckupReport(report, bank) {
  validateCheckupBank(bank);
  fields(report, ['schemaVersion','suiteId','kind','modelLabel','checkedAt','conditions','runs']);
  if (report.schemaVersion !== 'daily-checkup-report-v1' || report.suiteId !== CHECKUP_SUITE || !['demo','imported'].includes(report.kind)) fail('记录版本或来源错误');
  text(report.modelLabel,200,false); text(report.conditions,2000);
  if (report.checkedAt !== null) timestamp(report.checkedAt);
  if (!Array.isArray(report.runs) || report.runs.length !== 6 || report.runs.some((r,i) => !object(r) || r.taskId !== CHECKUP_IDS[i])) fail('记录必须按题库顺序保留六项；未测项保留为空');
  report.runs.forEach((row,i) => {
    const task = bank.tasks[i]; fields(row,['taskId','status','outputs','review','note']); text(row.note,2000);
    if (!['not_run','complete','incomplete'].includes(row.status) || !Array.isArray(row.outputs) || row.outputs.length !== task.prompts.length) fail('回答状态或轮数错误');
    row.outputs.forEach(o => { if (o !== null) text(o,100000,false); });
    const count = row.outputs.filter(o => o !== null).length;
    if (row.status === 'not_run' && count || row.status === 'complete' && count !== task.prompts.length || row.status === 'incomplete' && !count && !row.note.trim()) fail('回答内容与状态矛盾');
    if (row.review !== null) {
      if (task.mode === 'exact' || row.status !== 'complete') fail('这份回答暂不能人工确认');
      fields(row.review,['answers','note']); fields(row.review.answers,task.checks.map(c => c.id));
      if (Object.values(row.review.answers).some(v => !['yes','no','unsure'].includes(v))) fail('检查结果只能是是、否或拿不准');
      text(row.review.note,2000);
    }
  });
  return report;
}

export function assessCheckupRun(task, row) {
  if (row.status === 'not_run') return {verdict:'not_run',origin:'none',reason:'这项还没有回答。'};
  if (row.status !== 'complete') return {verdict:'review',origin:'none',reason:'回答或会话不完整，先补齐记录；不能据此判断记忆或理解能力。'};
  if (task.mode === 'exact') {
    const ok = row.outputs.at(-1).trim() === task.exactAnswer;
    return {verdict:ok?'normal':'missed',origin:'rule',reason:ok?'改好的句子与要求一致。':'句子没有逐字满足要求，请对照原句查看改动。'};
  }
  if (row.review === null) return {verdict:'review',origin:'none',reason:'请按下面几个检查点看回答；程序不靠关键词猜对错。'};
  const values = row.review.answers;
  const verdict = task.checks.some(c => c.essential && values[c.id] === 'no') ? 'wrong' : Object.values(values).includes('no') ? 'missed' : Object.values(values).includes('unsure') ? 'review' : 'normal';
  return {verdict,origin:'human',reason:{wrong:'你确认了关键事实或目的存在错误。',missed:'你确认了至少一项要求被遗漏。',review:'还有拿不准的检查点，先保留待看。',normal:'你确认了这道题的全部检查点。'}[verdict]};
}

export function assessCheckupReport(report, bank) {
  validateCheckupReport(report,bank);
  return bank.tasks.map((t,i) => ({taskId:t.id,...assessCheckupRun(t,report.runs[i])}));
}

export function compareCheckups(previous,current,bank) {
  const old=assessCheckupReport(previous,bank), latest=assessCheckupReport(current,bank);
  const comparable = !!(previous.conditions.trim() && previous.conditions === current.conditions && previous.modelLabel === current.modelLabel && previous.checkedAt && current.checkedAt && Date.parse(previous.checkedAt) < Date.parse(current.checkedAt));
  const rows=old.map((a,i) => {
    const b=latest[i]; let note=comparable?'这一项还需要完整回答和明确判断。':'先补齐同一模型、用法和前后日期。';
    if (comparable && ['normal','missed','wrong'].includes(a.verdict) && ['normal','missed','wrong'].includes(b.verdict)) note=a.verdict==='normal' && b.verdict!=='normal'?'上次正常，这次出现问题。':a.verdict!=='normal'&&b.verdict==='normal'?'上次有问题，这次正常。':b.verdict==='normal'?'两次都正常。':'两次都有问题，请对照回答。';
    return {taskId:a.taskId,previous:a.verdict,current:b.verdict,note};
  });
  return {comparable,rows,note:'先看具体回答的变化；一次翻车不能证明模型整体变差。'};
}

export const previewableCheckupSVG = output => typeof output==='string' && [...output].length<=100000 && staticSVGShape(output.trim());
export function importCheckupReport(text,bank) {
  const report=validateCheckupReport(parseCheckupJSON(text),bank);
  // A local file cannot authenticate a model identity or an official measurement.
  report.kind='imported'; return report;
}

export function changedCharacters(expected,actual) {
  const a=[...expected],b=[...actual]; let start=0,end=0;
  while (start<Math.min(a.length,b.length)&&a[start]===b[start]) start++;
  while (end<Math.min(a.length,b.length)-start && a[a.length-1-end]===b[b.length-1-end]) end++;
  return {prefix:b.slice(0,start).join(''),changed:b.slice(start,b.length-end).join(''),suffix:end?b.slice(-end).join(''):'',expectedChanged:a.slice(start,a.length-end).join('')};
}
