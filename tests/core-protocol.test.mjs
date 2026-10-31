import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateData,stats,csv,selectModels} from '../dist/lib.js';
import {metricSummary} from '../dist/core-metrics.js';
import {measurementScope,projectData} from '../dist/scope.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url),'utf8'));
const fixture=(taskId='core-m01',modelId='fixture-correct')=>projectData(read('offline'),{taskIds:[taskId],modelIds:[modelId]});
const summarize=d=>metricSummary(d,d.models[0].id);
const copyRun=(r,id)=>({...structuredClone(r),id});

test('all bundled datasets validate; core catalog has no invented measurements',()=>{
 for(const name of ['core','offline','catalog','demo','measured'])assert.equal(validateData(read(name)).meta.kind,read(name).meta.kind);
 const d=read('core'),s=summarize(d);assert.equal(d.runs.length,0);assert.equal(s.content,null);assert.equal(s.bodyTps,null);assert.equal(s.totalCost,null);assert.equal(s.costState,'unmeasured');
 assert.ok(d.models.every(m=>m.inputPrice===null&&m.outputPrice===null));
});

test('correct content in a fenced JSON response still fails independent format and delivery',()=>{
 const d=fixture('core-i04','fixture-format'),s=summarize(d);
 assert.equal(s.content,1);assert.equal(s.format,0);assert.equal(s.automaticDelivery,0);assert.equal(s.completed,1);assert.equal(s.qualified,0);
});

test('family weighting prevents repeats and multiple questions in one family from dominating',()=>{
 const d=projectData(read('offline'),{taskIds:['core-m01','core-m02','core-m03'],modelIds:['fixture-correct']});
 d.tasks.forEach((t,i)=>t.evaluation.familyId=i===2?'family-b':'family-a');
 d.runs.forEach(r=>r.grading.assessment.contentScore=r.taskId==='core-m03'?0:1);
 assert.equal(summarize(d).content,.5);assert.equal(summarize(d).contentFamilies,2);
 const source=d.runs.find(r=>r.taskId==='core-m01');
 for(let i=0;i<12;i++)d.runs.push(copyRun(source,'extra-'+i));
 assert.equal(summarize(d).content,.5);assert.equal(summarize(d).contentTasks,3);
});

test('core model sorting uses the same family-weighted delivery displayed in the table',()=>{
 const d=projectData(read('offline'),{taskIds:['core-m01','core-m02','core-m03'],modelIds:['fixture-correct','fixture-format']});
 d.models.forEach(m=>m.name=m.id==='fixture-correct'?'A':'Z');d.tasks.forEach((t,i)=>t.evaluation.familyId=i===2?'family-b':'family-a');
 d.runs.forEach(r=>{r.grading.assessment.qualified=r.modelId==='fixture-correct'?r.taskId!=='core-m03':r.taskId!=='core-m01'});
 assert.equal(metricSummary(d,'fixture-correct').automaticDelivery,.5);assert.equal(metricSummary(d,'fixture-format').automaticDelivery,.75);
 assert.equal(selectModels(d,{sort:'ruleDelivery'})[0].id,'fixture-format');
});

test('request failure affects delivery and completion while quality remains ungraded',()=>{
 const d=fixture(),r=copyRun(d.runs[0],'failed-attempt');
 r.status='timeout';r.error='request_timeout';r.grading={status:'not_applicable',score:null,assessment:{qualified:false,contentScore:null}};r.metrics.cost=.2;
 d.runs[0].metrics.cost=.1;d.runs.push(r);const s=summarize(d);
 assert.equal(s.content,1);assert.equal(s.automaticDelivery,.5);assert.equal(s.completed,.5);assert.equal(s.timeouts,1);
 assert.equal(s.costState,'available');assert.ok(Math.abs(s.costPerQualified-.3)<1e-12);
});

test('pending reviews and unknown costs never become zero-cost qualified results',()=>{
 const d=fixture('core-m05'),s=summarize(d);assert.equal(s.content,null);assert.equal(s.pending,1);assert.equal(s.qualified,0);assert.equal(s.qualificationCoverage,0);assert.equal(s.automaticDelivery,null);assert.equal(s.costState,'pending_review');assert.equal(s.costPerQualified,null);
 d.runs[0].metrics.cost=null;assert.equal(summarize(d).costState,'unknown_cost');assert.equal(summarize(d).totalCost,null);
 const auto=fixture();assert.equal(summarize(auto).costPerQualified,0);
 const bad=fixture('core-i04','fixture-format');assert.equal(summarize(bad).costState,'no_qualified');assert.equal(summarize(bad).costPerQualified,null);
});

test('legacy and new TPS remain separate and generic rate columns suppress mixed protocols',()=>{
 const d=fixture('core-i02'),core=d.runs[0],old=copyRun(core,'old-meter');
 core.measurement.bodyTps=100;core.metrics.outputTps=100;core.measurement.charsPerSec=100;core.metrics.charsPerSec=100;
 delete old.measurement;old.provenance={};old.metrics.outputTps=900;old.metrics.charsPerSec=900;d.runs.push(old);
 const s=summarize(d);assert.equal(s.bodyTps,100);assert.equal(s.bodyTpsSamples,1);assert.equal(s.legacyTps,900);assert.equal(s.legacyTpsSamples,1);
 assert.equal(stats(d,d.models[0].id).tps,null);assert.equal(stats(d,d.models[0].id).cps,null);assert.equal(stats(d,d.models[0].id).tpsSamples,0);
});

test('P95 requires 100 known successful durations with matching task and conditions',()=>{
 const d=fixture(),source=d.runs[0];d.runs=Array.from({length:100},(_,i)=>({...copyRun(source,'repeat-'+i),metrics:{...source.metrics,durationMs:i+1}}));
 assert.equal(summarize(d).tailState,'available');assert.equal(summarize(d).durationP95,95.05);
 d.runs[0].metrics.durationMs=null;assert.equal(summarize(d).tailState,'insufficient_sample');assert.equal(summarize(d).durationP95,null);
 d.runs[0].metrics.durationMs=1;d.runs[0].config.cacheState='warm';assert.equal(summarize(d).tailState,'mixed_conditions');assert.equal(summarize(d).durationP95,null);
 d.runs[0].config=structuredClone(source.config);d.tasks.push({...structuredClone(d.tasks[0]),id:'another-task'});d.runs[0].taskId='another-task';assert.equal(summarize(d).tailState,'mixed_conditions');
});

test('repetition groups deduplicate retries and keep different configurations separate',()=>{
 const d=fixture(),base=d.runs[0];
 const unit=(id,repeat,attempt,qualified,cache='unknown')=>{const r=copyRun(base,id);r.config={...r.config,repeatIndex:repeat,attemptIndex:attempt,cacheState:cache};r.grading.assessment.qualified=qualified;return r};
 d.runs=[unit('first-fail',0,0,false),unit('retry-pass',0,1,true),unit('second-pass',1,0,true)];
 let s=summarize(d);assert.equal(s.repeatedGroups,1);assert.equal(s.repeatUnits,2);assert.equal(s.disagreeGroups,0);
 d.runs.push(unit('third-fail',2,0,false));assert.equal(summarize(d).disagreeGroups,1);
 d.runs.push(unit('different-cache',3,0,false,'warm'));assert.equal(summarize(d).repeatUnits,3);
});

test('measurement scope follows actual run protocol independently from grader type',()=>{
 const d=fixture(),r=d.runs[0],t=d.tasks[0];t.grader={type:'exact',expected:r.output};delete t.evaluation;delete r.grading.assessment;
 const legacy=copyRun(r,'legacy-meter');delete legacy.measurement;legacy.provenance={};d.runs.push(legacy);delete d.meta.protocolId;
 const core=measurementScope(d,{protocolId:'core-client-v1'}),old=measurementScope(d,{protocolId:'legacy-sse-v2'});
 assert.equal(core.tasks.length,1);assert.equal(core.runs.length,1);assert.equal(old.tasks.length,1);assert.equal(old.runs.length,1);
 validateData(core);validateData(old);
 assert.equal(measurementScope(read('core'),{protocolId:'core-client-v1'}).tasks.length,24);
});

test('core budget-skipped jobs retain their scope without inventing measurements',()=>{
 const d=fixture(),r=d.runs[0];r.status='skipped';r.error='budget_reservation_exhausted';r.output='';delete r.measurement;r.provenance={timingSource:'not_sent'};
 Object.keys(r.metrics).forEach(k=>r.metrics[k]=null);r.grading={status:'not_applicable',score:null,reason:'not sent',assessment:{protocolId:'core-rubric-v1',contentState:'not_applicable',contentScore:null,formatState:'not_applicable',qualified:false,checks:[],constraints:[]}};
 const scoped=measurementScope(d,{protocolId:'core-client-v1'});validateData(scoped);assert.equal(scoped.runs.length,1);assert.equal(summarize(scoped).attempted,0);assert.equal(summarize(scoped).totalCost,null);
});

test('contract import rejects incompatible formats, malformed lists and invalid rubric anchors',()=>{
 for(const mutate of [g=>g.format='plain_text',g=>g.constraints='not a list',g=>g.constraints=null,g=>g.checks[0].expected=Infinity,g=>g.checks[0].expected=true,g=>g.checks[0].expected='1/0',g=>g.checks[0].id='',g=>g.checks[0].path=['nested'],g=>g.checks[0].absTolerance=null,g=>g.criteria=[{id:'bad'}],g=>g.constraints=[{id:'output-shape',type:'contains',text:'x'}]]){
  const d=fixture();mutate(d.tasks[0].grader);assert.throws(()=>validateData(d));
 }
 const d=fixture('core-m05');d.tasks[0].grader.criteria[0].full='';assert.throws(()=>validateData(d));
});

test('one_per_line constraint preserves texts and rejects empty, duplicate or non-string entries',()=>{
 const d=read('core');d.tasks[0].grader.constraints.push({id:'line-ids',label:'每行一个指定ID',type:'one_per_line',texts:['A1','B2'],privateExtension:'discard me'});
 const out=validateData(d),constraint=out.tasks[0].grader.constraints.at(-1);assert.deepEqual(constraint.texts,['A1','B2']);assert.equal(constraint.privateExtension,undefined);
 for(const texts of [null,'A1',[],[''],['  '],['A1','A1'],['A1',2],Array.from({length:101},(_,i)=>'item-'+i)]){const bad=structuredClone(d);bad.tasks[0].grader.constraints.at(-1).texts=texts;assert.throws(()=>validateData(bad));}
});

test('import binds assessment IDs, weights, states and totals to the declared contract',()=>{
 for(const mutate of [a=>a.checks=[],a=>a.checks[0].id='invented',a=>{a.checks[0].points=1;a.checks[0].earned=1},a=>a.constraints=[],a=>a.contentState='failed',a=>a.qualified=false]){
  const d=fixture();mutate(d.runs[0].grading.assessment);assert.throws(()=>validateData(d));
 }
 const d=fixture();d.runs[0].grading.score=0;assert.throws(()=>validateData(d));
 const text=fixture('core-i02');text.runs[0].grading.assessment.checks=[{id:'invented',label:'fake',passed:true,points:1,earned:1}];assert.throws(()=>validateData(text));
});

function reviewedFixture(){
 const d=fixture('core-m05'),r=d.runs[0],criteria=d.tasks[0].grader.criteria;
 // Synthetic reviewer evidence tests the import contract, not actual model work.
 r.grading.rubricReview={reviewer:'test-fixture',reviewedAt:'2026-10-25T00:00:00Z',items:criteria.map(c=>({id:c.id,awarded:c.points,reason:'Synthetic test evidence'}))};
 r.grading.assessment.checks=criteria.map(c=>({id:c.id,label:c.label,passed:true,points:c.points,earned:c.points}));
 Object.assign(r.grading.assessment,{contentScore:1,contentState:'passed',qualified:true});Object.assign(r.grading,{status:'passed',score:1});return d;
}

test('completed human reviews require complete anchored evidence matching check scores',()=>{
 validateData(reviewedFixture());
 for(const mutate of [g=>g.rubricReview.items.pop(),g=>g.rubricReview.items[0].awarded=0,g=>g.rubricReview.items[0].reason='',g=>g.assessment.checks[0].passed=false,g=>g.score=.5]){
  const d=reviewedFixture();mutate(d.runs[0].grading);assert.throws(()=>validateData(d));
 }
 const pending=fixture('core-m05');pending.runs[0].grading.rubricReview={reviewer:'fake',reviewedAt:'now',items:[]};assert.throws(()=>validateData(pending));
});

test('measurement import rejects status, usage, timing and protocol contradictions',()=>{
 for(const mutate of [r=>r.measurement.bodyTpsState='unknown_tokens',r=>r.measurement.visibleTokens++,r=>r.measurement.chunkCount=null,r=>r.measurement.sampleSeconds=null,r=>r.metrics.durationMs=null,r=>r.measurement.chunkGapP50Ms=r.measurement.chunkGapP95Ms+1,r=>r.measurement.chunkGapP50Ms=null,r=>r.measurement.endToEndTps=null,r=>delete r.provenance.streamUsageMode,r=>r.provenance.metricProtocol='legacy-sse-v2',r=>delete r.measurement]){
  const d=fixture('core-i02');mutate(d.runs[0]);assert.throws(()=>validateData(d));
 }
 const d=fixture();d.meta.protocolId='legacy-sse-v2';assert.throws(()=>validateData(d));
});

test('toy stream counters cannot be imported as real measured results',()=>{
 const d=fixture();d.meta.kind='measured';d.models.forEach(m=>m.status='measured');d.batches.forEach(b=>b.dataKind='measured');d.runs.forEach(r=>{r.dataKind='measured';r.provenance.streamUsageMode='cumulative_visible_fixture'});
 assert.throws(()=>validateData(d),/玩具/);
});

test('public projection preserves rubric and measurement evidence but removes private extensions',()=>{
 const d=reviewedFixture(),r=d.runs[0];r.measurement.privateExtension='PRIVATE_SENTINEL';r.grading.rubricReview.items[0].privateExtension='PRIVATE_SENTINEL';d.tasks[0].grader.criteria[0].privateExtension='PRIVATE_SENTINEL';
 const out=validateData(d),serialized=JSON.stringify(out);assert.ok(!serialized.includes('PRIVATE_SENTINEL'));assert.equal(out.runs[0].grading.rubricReview.items.length,d.tasks[0].grader.criteria.length);assert.equal(out.tasks[0].grader.criteria[0].passAt,d.tasks[0].grader.criteria[0].passAt);
 const exported=csv(fixture('core-i02'));assert.ok(exported.includes('新协议正文TPS'));assert.ok(exported.includes('core-client-v1'));assert.ok(exported.includes('内容分_题族等权'));
});
