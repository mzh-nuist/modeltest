import fs from 'node:fs';
import {gradeShort as gradeV1} from '../dist/short-challenge-engine.js';
import {gradeShort as gradeV2} from '../dist/short-challenge-grading.js';
const bank=JSON.parse(fs.readFileSync('dist/data/short-challenges.json','utf8'));
const gradeShort=bank.scoreVersion==='short-rubric-v2'?gradeV2:gradeV1;
const records=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const results=records.map(r=>{const t=bank.tasks.find(t=>t.id===r.taskId),c=t?.cases.find(c=>c.id===r.caseId);if(!c)throw Error('Unknown case');return {...r,grade:gradeShort(t,c,r.output,r.status)};});
fs.writeFileSync(process.argv[3],JSON.stringify(results,null,2)+'\n');
