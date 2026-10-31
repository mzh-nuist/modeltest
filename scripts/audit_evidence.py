"""Read-only audit of curated records against local raw evidence. No API calls."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.anthropic import MessagesStream
from runner.core import grade, validate_document
from runner.rates import estimate_rates

ROOT=Path(__file__).resolve().parents[1]


def audit(document,raw_paths):
    errors=validate_document(document)
    if errors:raise ValueError('; '.join(errors))
    if document['meta']['kind']!='measured':raise ValueError('Requires measured data')
    by_id={}
    for path in raw_paths:
        raw=json.loads(path.read_text(encoding='utf-8'))
        ident=raw['runId']
        if ident in by_id:raise ValueError('Duplicate local raw identity')
        by_id[ident]=(path,raw)
    models={m['id']:m for m in document['models']}
    tasks={t['id']:t for t in document['tasks']}
    records=[];rates_checked=0;costs_checked=0;graded_checked=0;skipped=0
    for run in document['runs']:
        if run['status']=='skipped':skipped+=1;continue
        if run['id'] not in by_id:raise ValueError('Missing raw evidence for an attempted request')
        path,raw=by_id[run['id']];task=tasks[run['taskId']];model=models[run['modelId']]
        prompt_hash=hashlib.sha256(task['prompt'].encode('utf-8')).hexdigest()
        if raw.get('taskSha256')!=prompt_hash:raise ValueError('Prompt identity mismatch')
        request=raw.get('request',{})
        if request.get('messages')!=[{'role':'user','content':task['prompt']}]:raise ValueError('Request body differs from published task')
        if request.get('model')!=model['version'].split(' · ')[0]:raise ValueError('Requested alias differs from published model version')
        cap=request.get('max_completion_tokens',request.get('max_tokens'))
        if cap!=min(model['maxOutputTokens'],task['maxOutputTokens']):raise ValueError('Requested output cap differs from published configuration')
        if grade(run['output'],task['grader'],run['status'])!=run['grading']:
            raise ValueError('Published automatic grading differs from declared rule')
        if task['grader']['type']!='manual':graded_checked+=1
        if run['status']=='success':
            if not raw.get('streamDone') or not raw.get('finishSeen'):raise ValueError('Successful record lacks completion evidence')
            normalizer=MessagesStream() if run['provenance']['adapter']=='anthropic-messages' else None
            chunks=[]
            for entry in raw.get('events',[]):
                event=entry['data']
                if normalizer:event,_=normalizer.normalize(event)
                for choice in event.get('choices',[]):
                    text=choice.get('delta',{}).get('content')
                    if isinstance(text,str) and text:chunks.append((entry['elapsedMs']/1000,text))
            if ''.join(text for _,text in chunks)!=run['output']:raise ValueError('Published body differs from SSE text')
            metrics=run['metrics'];tokens=None
            if metrics['outputTokens'] is not None and metrics['reasoningTokens'] is not None:
                tokens=metrics['outputTokens']-metrics['reasoningTokens']
            recomputed=estimate_rates(run['status'],chunks,tokens)
            for field in ('outputTps','charsPerSec'):
                a,b=metrics[field],recomputed[field]
                if (a is None)!=(b is None) or (a is not None and not math.isclose(a,b,rel_tol=1e-4,abs_tol=.01)):
                    raise ValueError('Published rate differs from preserved SSE timing')
            rates_checked+=1
        metrics=run['metrics']
        if metrics['cost'] is not None:
            if metrics['inputTokens'] is None or metrics['outputTokens'] is None:raise ValueError('Known cost lacks reported usage')
            expected=(metrics['inputTokens']*model['inputPrice']+metrics['outputTokens']*model['outputPrice'])/1_000_000
            if not math.isclose(metrics['cost'],expected,rel_tol=1e-9,abs_tol=1e-12):raise ValueError('Nominal cost arithmetic mismatch')
            costs_checked+=1
        records.append({'runId':run['id'],'taskSha256':prompt_hash,
                        'requestSha256':hashlib.sha256(json.dumps(request,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest(),
                        'rawSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                        'outputSha256':hashlib.sha256(run['output'].encode('utf-8')).hexdigest()})
    return {'schemaVersion':'1.0','sourceUpdatedAt':document['meta']['updatedAt'],
            'note':'Local reproducibility audit, not independent certification or upstream model identity verification. No raw text or credentials are included.',
            'attemptedRecords':len(records),'skippedRecords':skipped,'successBodiesAndRatesChecked':rates_checked,
            'automaticRuleStatesChecked':graded_checked,'nominalCostsChecked':costs_checked,
            'unknownCostCount':sum(r['status']!='skipped' and r['metrics']['cost'] is None for r in document['runs']),
            'statuses':dict(Counter(r['status'] for r in document['runs'])),'records':records}


if __name__=='__main__':
    document=json.loads((ROOT/'dist/data/measured.json').read_text(encoding='utf-8'))
    raw_paths=sorted((ROOT/'results').glob('commandcode-*/raw/*.json'))
    result=audit(document,raw_paths)
    (ROOT/'docs/EVIDENCE-AUDIT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='records'}))
