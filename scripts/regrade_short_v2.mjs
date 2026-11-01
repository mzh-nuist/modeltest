// Offline correction only. Does not send or repeat any model request.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gradeShort} from '../dist/short-challenge-grading.js';
const dir='dist/data/',bankPath=dir+'short-challenges.json',resultPath=dir+'short-challenge-results.json';
const fromArchive=process.argv.includes('--from-archive');
const bytes=fs.readFileSync(fromArchive?dir+'short-challenges-v1.json':bankPath),bank=JSON.parse(bytes),raw=fs.readFileSync(fromArchive?dir+'short-challenge-results-v1.json':resultPath),results=JSON.parse(raw);
if(bank.scoreVersion!=='short-rubric-v1'||results.scoreVersion!=='short-rubric-v1'||results.records.length!==40)throw Error('Only the completed v1 pilot may be corrected');
if(!fromArchive)for(const [name,body] of [['short-challenges-v1.json',bytes],['short-challenge-results-v1.json',raw]]){if(fs.existsSync(dir+name))throw Error('Never overwrite the original pilot');fs.writeFileSync(dir+name,body);}
const note='评分修订v2：题面未改，原答卷未改、未重采。唯一一行动作串允许加粗或行内代码标记；齿轮允许唯一JSON对象附解释，额外说明仍扣格式；啮合对接受BC或[B,C]两种表示。初版试评分与判分器保留下载，不解释成模型能力提升。';
bank.scoreVersion='short-rubric-v2';bank.protocol.gradingRevision=note;
bank.tasks[0].criteria.find(c=>c.dimension==='format').rule='去除首尾空白后仅含大写UDLR且非空，得10分；解释、围栏、加粗或其他字符得0分。内容可提取唯一一行动作串（允许成对加粗或行内代码标记）验证；多条候选不择优。';
const gear=bank.tasks.find(t=>t.id==='gear-scam');
gear.criteria.find(c=>c.max===60).rule='cut接受AB或BA字符串、或[A,B]二项字符串数组；只含互不重复的原有啮合对。删除后仍连通且每条边可反向赋值，删除数量达到枚举最小值，得60分，否则0分。可行机构的最少修复是空数组。';
gear.criteria.find(c=>c.dimension==='format').rule='正文仅为一个JSON对象，且恰含can布尔和cut啮合对数组两个字段，得10分，否则0分；重复字段无效。内容可从说明或代码围栏中提取唯一JSON对象，格式仍扣分；多份JSON候选不择优。';
const updated=JSON.stringify(bank,null,2)+'\n';fs.writeFileSync(bankPath,updated);
results.collectionBankSha256=results.bankSha256;results.previousGraderSha256=results.graderSha256;
results.bankSha256=createHash('sha256').update(updated).digest('hex');results.scoreVersion=bank.scoreVersion;
results.graderSha256=createHash('sha256').update(fs.readFileSync('dist/short-challenge-grading.js')).digest('hex');results.gradingRevision=note;
results.collectionCompletedAt=results.updatedAt;results.gradingUpdatedAt=new Date().toISOString();results.updatedAt=results.gradingUpdatedAt;
results.records=results.records.map(r=>{const task=bank.tasks.find(t=>t.id===r.taskId),c=task.cases.find(c=>c.id===r.caseId);return {...r,previousGrade:r.grade,grade:gradeShort(task,c,r.output,r.status)};});
fs.writeFileSync(resultPath,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({records:results.records.length,changed:results.records.filter(r=>r.grade.total!==r.previousGrade.total).map(r=>({model:r.modelId,case:r.caseId,before:r.previousGrade.total,after:r.grade.total})),modelCalls:0}));
